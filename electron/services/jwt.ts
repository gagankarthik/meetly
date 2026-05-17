// Minimal unsafe JWT decoder — does NOT verify signature. We only use it to read
// claims (sub, email, exp) for client-side UX. Authoritative verification happens
// AWS-side when we use the token.
export function jwtDecode<T = unknown>(token: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(parts[1].length + (4 - parts[1].length % 4) % 4, '=');
  const json = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(json) as T;
}
