// Secret storage with two backends:
//   1. OS keychain via keytar (Windows Credential Vault / macOS Keychain / libsecret)
//   2. A user-only JSON file at <userData>/secrets.json as a reliable fallback
// We write to BOTH on every set so persistence survives flaky keychains (DPAPI
// corruption, macOS Keychain prompts declined, etc.). We read keychain first and
// fall through to the file if the keychain returns null or errors.
//
// The file is mode 0o600 (user-only read/write). Not encrypted on disk — but
// neither is a normal Electron app's preferences. The threat model here is
// "keep the session usable across restarts", not "defeat a local attacker".
import keytar from 'keytar';
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SERVICE = 'com.oceanblue.meetly';

function fallbackPath(): string {
  return path.join(app.getPath('userData'), 'secrets.json');
}

async function readFallback(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(fallbackPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeFallback(data: Record<string, string>): Promise<void> {
  try {
    await fs.writeFile(fallbackPath(), JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch (e: any) {
    console.warn('[secrets] fallback file write failed:', e?.message || e);
  }
}

export async function setSecret(key: string, value: string): Promise<void> {
  // Try keytar first (best — encrypted by OS).
  try {
    await keytar.setPassword(SERVICE, key, value);
  } catch (e: any) {
    console.warn('[secrets] keytar setPassword failed (using fallback file):', e?.message || e);
  }
  // ALWAYS also write to the fallback so session survives even when keytar breaks.
  const data = await readFallback();
  data[key] = value;
  await writeFallback(data);
}

export async function getSecret(key: string): Promise<string | null> {
  // Keychain first
  try {
    const v = await keytar.getPassword(SERVICE, key);
    if (v != null) return v;
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    console.warn('[secrets] keytar getPassword failed:', key, msg);
    // Only purge on truly corrupt data (Windows DPAPI). Transient errors keep
    // the entry intact so a future read might succeed.
    if (/bad data|cannot decode|decrypt|stub received/i.test(msg)) {
      console.warn('[secrets] dropping corrupt keychain entry:', key);
      try { await keytar.deletePassword(SERVICE, key); } catch {/* noop */}
    }
  }
  // Fall back to the file store
  const data = await readFallback();
  return data[key] ?? null;
}

export async function deleteSecret(key: string): Promise<boolean> {
  let removed = false;
  try {
    if (await keytar.deletePassword(SERVICE, key)) removed = true;
  } catch (e: any) {
    console.warn('[secrets] keytar deletePassword failed:', key, e?.message || e);
  }
  const data = await readFallback();
  if (key in data) {
    delete data[key];
    await writeFallback(data);
    removed = true;
  }
  return removed;
}

export async function clearAllSecrets(): Promise<void> {
  try {
    const all = await keytar.findCredentials(SERVICE);
    await Promise.all(all.map((c) => keytar.deletePassword(SERVICE, c.account).catch(() => false)));
  } catch (e: any) {
    console.warn('[secrets] findCredentials failed:', e?.message || e);
  }
  await writeFallback({});
}
