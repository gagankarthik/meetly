// Auth — clean Cognito flow.
//   getSession()  → returns AuthSession | null, NEVER throws
//   signIn(...)   → returns AuthSession,        throws human Cognito errors
//   signUp(...)   → returns AuthSession,        admin auto-confirms (no OTP)
//   signOut()     → clears local + remote,      NEVER throws
//
// Every keychain read goes through secrets.ts which self-heals corrupt entries,
// so a "stub received bad data" DPAPI failure just means "no session yet" and
// the user is sent to the auth screen instead of crashing.
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  GlobalSignOutCommand,
  AdminConfirmSignUpCommand,
  AdminUpdateUserAttributesCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import { BrowserWindow } from 'electron';
import { jwtDecode } from './jwt';
import { getSecret, setSecret, deleteSecret } from './secrets';
import type { AuthSession } from '@shared/types';
import { IpcChannel } from '@shared/types';

// ---- Env (read lazily — dotenv loads after these imports) ----
const getRegion     = () => process.env.AWS_REGION || 'us-east-1';
const getUserPoolId = () => process.env.COGNITO_USER_POOL_ID || '';
const getClientId   = () => process.env.COGNITO_APP_CLIENT_ID || '';
const isDevBypass   = () => process.env.DEV_SKIP_AUTH === 'true';

const SECRET_KEY = 'auth:session';
const REFRESH_WINDOW_MS = 60_000;  // refresh tokens that expire in <60s

let cachedSession: AuthSession | null = null;

// ---- Clients (lazy) ----

let _client: CognitoIdentityProviderClient | null = null;
function client(): CognitoIdentityProviderClient {
  if (!_client) _client = new CognitoIdentityProviderClient({ region: getRegion() });
  return _client;
}

let _adminClient: CognitoIdentityProviderClient | null = null;
function adminClient(): CognitoIdentityProviderClient {
  if (_adminClient) return _adminClient;
  const accessKeyId = process.env.AWS_ADMIN_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_ADMIN_SECRET_ACCESS_KEY || '';
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Sign-up requires AWS_ADMIN_ACCESS_KEY_ID + AWS_ADMIN_SECRET_ACCESS_KEY in .env.local');
  }
  _adminClient = new CognitoIdentityProviderClient({
    region: getRegion(),
    credentials: { accessKeyId, secretAccessKey },
  });
  return _adminClient;
}

// ===========================================================================
// Public API
// ===========================================================================

export async function getSession(): Promise<AuthSession | null> {
  if (isDevBypass()) return DEV_SESSION;

  // In-memory cache first
  if (cachedSession && cachedSession.expiresAt > Date.now() + REFRESH_WINDOW_MS) {
    return cachedSession;
  }

  // Try the keychain — getSecret self-heals on corruption (returns null).
  const raw = await getSecret(SECRET_KEY);
  if (!raw) {
    cachedSession = null;
    return null;
  }

  // Parse — if the stored value is somehow malformed, drop it.
  let stored: AuthSession;
  try {
    stored = JSON.parse(raw) as AuthSession;
  } catch (e: any) {
    console.warn('[cognito] stored session malformed, clearing', e?.message || e);
    await deleteSecret(SECRET_KEY);
    cachedSession = null;
    return null;
  }

  // Still valid? Cache + return.
  if (stored.expiresAt > Date.now() + REFRESH_WINDOW_MS) {
    cachedSession = stored;
    return stored;
  }

  // Expiring soon — try to refresh. On any failure, clear and act as signed-out.
  try {
    const refreshed = await refreshTokens(stored.refreshToken);
    return refreshed;
  } catch (e: any) {
    console.warn('[cognito] refresh failed, clearing session', e?.message || e);
    await deleteSecret(SECRET_KEY);
    cachedSession = null;
    return null;
  }
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  assertConfigured();
  const res = await client().send(new InitiateAuthCommand({
    AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
    ClientId: getClientId(),
    AuthParameters: { USERNAME: email, PASSWORD: password },
  })).catch(translateCognitoError);

  const a = (res as any).AuthenticationResult;
  if (!a?.IdToken || !a.AccessToken || !a.RefreshToken) {
    throw new Error('Sign in failed: Cognito returned no tokens');
  }
  return persist(buildSession(a.IdToken, a.AccessToken, a.RefreshToken));
}

// Sign-up flow:
//   1. SignUp (creates the user in UNCONFIRMED state)
//   2. AdminConfirmSignUp (skips the OTP email — admin keys required)
//   3. AdminUpdateUserAttributes to set email_verified=true (lets InitiateAuth succeed)
//   4. SignIn to issue tokens for the now-active user
// If the user already exists but isn't signed in, we still try to confirm + sign in.
export async function signUp(email: string, password: string, displayName?: string): Promise<AuthSession> {
  assertConfigured();
  try {
    await client().send(new SignUpCommand({
      ClientId: getClientId(),
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        ...(displayName ? [{ Name: 'name', Value: displayName }] : []),
      ],
    }));
  } catch (e: any) {
    // If the user already exists, fall through to confirm + sign in — covers the case
    // where signup was started before but never completed.
    if (e?.name !== 'UsernameExistsException') {
      translateCognitoError(e);
    }
  }

  try {
    await adminClient().send(new AdminConfirmSignUpCommand({
      UserPoolId: getUserPoolId(), Username: email,
    }));
  } catch (e: any) {
    if (e?.name !== 'NotAuthorizedException' /* already confirmed */) {
      console.warn('[cognito] admin-confirm failed', e?.message || e);
    }
  }

  try {
    await adminClient().send(new AdminUpdateUserAttributesCommand({
      UserPoolId: getUserPoolId(), Username: email,
      UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
    }));
  } catch (e: any) {
    console.warn('[cognito] mark email_verified failed', e?.message || e);
  }

  return signIn(email, password);
}

export async function signOut(): Promise<void> {
  const session = cachedSession;
  cachedSession = null;
  await deleteSecret(SECRET_KEY);

  if (session?.accessToken && session.accessToken !== 'dev') {
    try {
      await client().send(new GlobalSignOutCommand({ AccessToken: session.accessToken }));
    } catch (e: any) {
      // Token may already be revoked — not fatal.
      console.warn('[cognito] GlobalSignOut failed (non-fatal)', e?.message || e);
    }
  }
  broadcastSession(null);
}

export function getUserPoolEndpoint(): string {
  return `cognito-idp.${getRegion()}.amazonaws.com/${getUserPoolId()}`;
}

// ===========================================================================
// Internal helpers
// ===========================================================================

const DEV_SESSION: AuthSession = {
  userId: 'local-dev-user',
  email: 'dev@meetly.local',
  displayName: 'Local Dev',
  idToken: 'dev', accessToken: 'dev', refreshToken: 'dev',
  expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
};

function buildSession(idToken: string, accessToken: string, refreshToken: string): AuthSession {
  const claims = jwtDecode<{ sub: string; email: string; name?: string; exp: number }>(idToken);
  return {
    userId: claims.sub,
    email: claims.email,
    displayName: claims.name,
    idToken, accessToken, refreshToken,
    expiresAt: claims.exp * 1000,
  };
}

async function persist(session: AuthSession): Promise<AuthSession> {
  cachedSession = session;
  try {
    await setSecret(SECRET_KEY, JSON.stringify(session));
  } catch (e: any) {
    // If we can't even store to keychain, keep the in-memory session and warn.
    // The user stays signed in for this session but won't survive a restart.
    console.warn('[cognito] could not persist session to keychain', e?.message || e);
  }
  broadcastSession(session);
  return session;
}

async function refreshTokens(refreshToken: string): Promise<AuthSession> {
  const res = await client().send(new InitiateAuthCommand({
    AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
    ClientId: getClientId(),
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  }));
  const a = res.AuthenticationResult;
  if (!a?.IdToken || !a.AccessToken) throw new Error('Refresh returned no tokens');
  // Refresh response doesn't include a new refresh token — reuse the existing one.
  return persist(buildSession(a.IdToken, a.AccessToken, refreshToken));
}

function broadcastSession(session: AuthSession | null) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IpcChannel.AuthSessionChanged, session);
  }
}

function assertConfigured() {
  if (!getUserPoolId() || !getClientId()) {
    throw new Error('Cognito not configured — set COGNITO_USER_POOL_ID + COGNITO_APP_CLIENT_ID in .env.local');
  }
}

// Cognito throws structured errors. We normalize them into friendly messages so
// the UI can show something useful without parsing AWS error names.
function translateCognitoError(e: any): never {
  const name = e?.name || '';
  const msg = e?.message || 'Unknown error';
  switch (name) {
    case 'NotAuthorizedException':         throw new Error('Incorrect email or password.');
    case 'UserNotFoundException':          throw new Error('No account found for that email.');
    case 'UserNotConfirmedException':      throw new Error('Account is not confirmed yet.');
    case 'UsernameExistsException':        throw new Error('An account with that email already exists.');
    case 'InvalidPasswordException':       throw new Error('Password must be 8+ characters with a number.');
    case 'InvalidParameterException':      throw new Error('Check your email format and password.');
    case 'CodeMismatchException':          throw new Error('That confirmation code didn\'t match.');
    case 'ExpiredCodeException':           throw new Error('That confirmation code expired.');
    case 'LimitExceededException':         throw new Error('Too many attempts — try again in a minute.');
    case 'PasswordResetRequiredException': throw new Error('Password reset required.');
    case 'TooManyRequestsException':       throw new Error('Too many requests — slow down.');
    case 'TooManyFailedAttemptsException': throw new Error('Too many failed attempts — try later.');
    default:
      console.error('[cognito]', name, msg);
      throw new Error(msg);
  }
}
