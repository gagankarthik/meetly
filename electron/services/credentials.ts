import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { getSession } from './cognito';
import { getUserPoolEndpoint } from './cognito';
import { config } from './config';

const getRegion         = () => config.awsRegion;
const getIdentityPoolId = () => config.cognitoIdentityPoolId;

let cached: { creds: AwsCredentialIdentity; userId: string; expiry: number } | null = null;
let provider: AwsCredentialIdentityProvider | null = null;

export async function getAwsCredentials(): Promise<AwsCredentialIdentity> {
  const identityPoolId = getIdentityPoolId();
  if (!identityPoolId) {
    throw new Error('Cognito Identity Pool not configured. Reinstall the latest build.');
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
