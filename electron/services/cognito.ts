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
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  GlobalSignOutCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import { BrowserWindow } from 'electron';
import { jwtDecode } from './jwt';
import { getSecret, setSecret, deleteSecret } from './secrets';
import { config } from './config';
import type { AuthSession } from '@shared/types';
import { IpcChannel } from '@shared/types';

// All values come from electron/services/config.ts — baked at build time,
// fall back to process.env in dev.
const getRegion     = () => config.awsRegion;
const getUserPoolId = () => config.cognitoUserPoolId;
const getClientId   = () => config.cognitoAppClientId;
const isDevBypass   = () => config.devSkipAuth;

const SECRET_KEY = 'auth:session';
const REFRESH_WINDOW_MS = 60_000;  // refresh tokens that expire in <60s

let cachedSession: AuthSession | null = null;

// ---- Clients (lazy) ----

let _client: CognitoIdentityProviderClient | null = null;
function client(): CognitoIdentityProviderClient {
  if (!_client) _client = new CognitoIdentityProviderClient({ region: getRegion() });
  return _client;
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

// Sign-up: create the user; Cognito emails a 6-digit code. The caller then
// asks the user for the code and calls confirmSignUp(). If the user already
// exists but is unconfirmed, we silently re-send the code and return
// requiresConfirmation so the UI routes to the confirm screen.
export async function signUp(
  email: string,
  password: string,
  displayName?: string,
): Promise<{ requiresConfirmation: true; email: string }> {
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
    if (e?.name === 'UsernameExistsException') {
      // Existing UNCONFIRMED user: re-issue a code so they can complete signup.
      // Existing CONFIRMED user: ResendConfirmationCode throws InvalidParameter
      // ("User is already confirmed") — swallow that and let the UI surface a
      // "sign in instead" message via the error translation below.
      try {
        await client().send(new ResendConfirmationCodeCommand({
          ClientId: getClientId(),
          Username: email,
        }));
      } catch (resendErr: any) {
        if (/already confirmed/i.test(resendErr?.message || '')) {
          throw new Error('An account with that email already exists. Try signing in.');
        }
        translateCognitoError(resendErr);
      }
    } else {
      translateCognitoError(e);
    }
  }
  return { requiresConfirmation: true, email };
}

export async function confirmSignUp(email: string, code: string, password?: string): Promise<AuthSession | null> {
  assertConfigured();
  try {
    await client().send(new ConfirmSignUpCommand({
      ClientId: getClientId(),
      Username: email,
      ConfirmationCode: code,
    }));
  } catch (e: any) {
    translateCognitoError(e);
  }
  // If the caller passed the password we used at signUp, log them straight in.
  // Otherwise let the UI route them back to the sign-in screen.
  if (password) return signIn(email, password);
  return null;
}

export async function resendConfirmationCode(email: string): Promise<void> {
  assertConfigured();
  try {
    await client().send(new ResendConfirmationCodeCommand({
      ClientId: getClientId(),
      Username: email,
    }));
  } catch (e: any) {
    translateCognitoError(e);
  }
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
    // In a packaged build this is impossible (the build step would have
    // failed without these). So this only fires in dev when .env.local
    // hasn't been populated.
    throw new Error('Cognito not configured. Run `terraform apply` in /infra and copy the outputs into .env.local.');
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
