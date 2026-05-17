import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { getSession } from './cognito';
import { getUserPoolEndpoint } from './cognito';

// Read lazily — dotenv loads after these module imports (ES imports are hoisted).
const getRegion          = () => process.env.AWS_REGION || 'us-east-2';
const getIdentityPoolId  = () => process.env.COGNITO_IDENTITY_POOL_ID || '';
const getStaticAccessKey = () => process.env.AWS_ACCESS_KEY_ID || '';
const getStaticSecretKey = () => process.env.AWS_SECRET_ACCESS_KEY || '';

let cached: { creds: AwsCredentialIdentity; userId: string; expiry: number } | null = null;
let provider: AwsCredentialIdentityProvider | null = null;

export async function getAwsCredentials(): Promise<AwsCredentialIdentity> {
  // DEV_SKIP_AUTH: use admin IAM keys directly so DynamoDB works without a real Cognito sign-in.
  if (process.env.DEV_SKIP_AUTH === 'true') {
    const accessKeyId = process.env.AWS_ADMIN_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_ADMIN_SECRET_ACCESS_KEY || '';
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('DEV_SKIP_AUTH needs AWS_ADMIN_ACCESS_KEY_ID + AWS_ADMIN_SECRET_ACCESS_KEY');
    }
    return { accessKeyId, secretAccessKey };
  }

  const staticKey = getStaticAccessKey();
  const staticSecret = getStaticSecretKey();
  // Dev shortcut: static IAM keys in .env bypass the Cognito Identity Pool.
  // User Pool sign-in is still required so dynamodb.ts can build USER#<sub> keys.
  if (staticKey && staticSecret) {
    const session = await getSession();
    if (!session) throw new Error('Not signed in');
    return { accessKeyId: staticKey, secretAccessKey: staticSecret };
  }

  const identityPoolId = getIdentityPoolId();
  if (!identityPoolId) {
    throw new Error('COGNITO_IDENTITY_POOL_ID not set — run terraform and copy into .env');
  }
  const session = await getSession();
  if (!session) throw new Error('Not signed in');

  if (cached && cached.userId === session.userId && cached.expiry > Date.now() + 60_000) {
    return cached.creds;
  }

  // Cast: the credential-provider package declares the client type via its own
  // bundled @aws-sdk/nested-clients subpath, which structurally matches the
  // public CognitoIdentityClient but isn't nominally identical to TS.
  provider = fromCognitoIdentityPool({
    client: new CognitoIdentityClient({ region: getRegion() }) as any,
    identityPoolId,
    logins: { [getUserPoolEndpoint()]: session.idToken },
  });

  const creds = await provider();
  cached = {
    creds,
    userId: session.userId,
    expiry: creds.expiration ? creds.expiration.getTime() : Date.now() + 50 * 60 * 1000,
  };
  return creds;
}

export function clearCredentialCache() {
  cached = null;
  provider = null;
}
