// Secret storage — keytar wraps the OS keychain (Windows Credential Vault, macOS
// Keychain, libsecret on Linux). Every call is wrapped because keychain ops can
// fail in surprising ways:
//   - "Stub received bad data" — Windows DPAPI can't decrypt a stale entry
//     (typically because the OS user account or master key changed).
//   - "The specified item could not be found" — race between get + delete.
//   - "User cancelled" — macOS Keychain unlock prompt declined.
// We treat any read failure as "no secret" and self-heal corrupt entries by
// deleting them so a subsequent set can write clean data.
import keytar from 'keytar';

const SERVICE = 'com.oceanblue.meetly';

export async function setSecret(key: string, value: string): Promise<void> {
  try {
    await keytar.setPassword(SERVICE, key, value);
  } catch (e: any) {
    // Try once to clear a corrupted entry, then retry the write.
    await safeDelete(key);
    try {
      await keytar.setPassword(SERVICE, key, value);
    } catch (e2: any) {
      console.error('[secrets] setPassword failed', key, e2?.message || e2);
      throw new Error(`Could not store secret in OS keychain: ${e2?.message || 'unknown error'}`);
    }
  }
}

export async function getSecret(key: string): Promise<string | null> {
  try {
    const v = await keytar.getPassword(SERVICE, key);
    return v ?? null;
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    // Self-heal: corrupt DPAPI / lost master key — drop the entry and act like nothing was there.
    console.warn('[secrets] getPassword failed, clearing entry:', key, msg);
    await safeDelete(key);
    return null;
  }
}

export async function deleteSecret(key: string): Promise<boolean> {
  return safeDelete(key);
}

export async function clearAllSecrets(): Promise<void> {
  let all: { account: string }[] = [];
  try {
    all = await keytar.findCredentials(SERVICE);
  } catch (e: any) {
    console.warn('[secrets] findCredentials failed', e?.message || e);
    return;
  }
  await Promise.all(all.map((c) => safeDelete(c.account)));
}

async function safeDelete(key: string): Promise<boolean> {
  try {
    return await keytar.deletePassword(SERVICE, key);
  } catch (e: any) {
    console.warn('[secrets] deletePassword failed', key, e?.message || e);
    return false;
  }
}
