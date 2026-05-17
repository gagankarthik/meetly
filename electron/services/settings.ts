import { BrowserWindow, app } from 'electron';
import { setSecret, getSecret, deleteSecret, clearAllSecrets } from './secrets';
import { resetOpenaiClient } from './openai';
import { IpcChannel, UserSettings } from '@shared/types';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS: UserSettings = {
  openaiKeyConfigured: false,
  deepgramKeyConfigured: false,
  openaiKeySource: null,
  deepgramKeySource: null,
  defaultMode: 'general',
  saveTranscripts: true,
  telemetryOptIn: false,
  clickThrough: false,
  contentProtection: true,
  hotkeyToggle: 'CommandOrControl+\\',
  hotkeyAsk: 'CommandOrControl+Return',
  hotkeyScreenshot: 'CommandOrControl+Shift+S',
  hotkeyHide: 'CommandOrControl+Shift+H',
};

let cache: UserSettings | null = null;

async function load(): Promise<UserSettings> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
    const stored = JSON.parse(raw);
    cache = { ...DEFAULTS, ...stored };
  } catch {
    cache = { ...DEFAULTS };
  }
  // Key resolution: keychain wins over env, but either makes the key "configured".
  const openaiInKeychain   = !!(await getSecret('openai:api-key'));
  const deepgramInKeychain = !!(await getSecret('deepgram:api-key'));
  cache!.openaiKeySource     = openaiInKeychain   ? 'keychain' : process.env.OPENAI_API_KEY   ? 'env' : null;
  cache!.deepgramKeySource   = deepgramInKeychain ? 'keychain' : process.env.DEEPGRAM_API_KEY ? 'env' : null;
  cache!.openaiKeyConfigured   = cache!.openaiKeySource   !== null;
  cache!.deepgramKeyConfigured = cache!.deepgramKeySource !== null;
  return cache!;
}

async function persist() {
  if (!cache) return;
  const { openaiKeyConfigured, deepgramKeyConfigured, openaiKeySource, deepgramKeySource, ...persisted } = cache;
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(persisted, null, 2), 'utf8');
}

function broadcast(next: UserSettings) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(IpcChannel.SettingsChanged, next);
  });
}

export async function getSettings(): Promise<UserSettings> {
  return load();
}

export async function updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const current = await load();
  // Never let the renderer set the *Configured flags directly
  const { openaiKeyConfigured, deepgramKeyConfigured, ...safe } = patch as any;
  cache = { ...current, ...safe };
  await persist();
  broadcast(cache!);
  // If any hotkey changed, re-bind global shortcuts so the new combos take effect.
  if (['hotkeyToggle', 'hotkeyAsk', 'hotkeyScreenshot', 'hotkeyHide'].some((k) => k in safe)) {
    const { registerGlobalShortcuts } = await import('./shortcuts');
    registerGlobalShortcuts().catch((e) => console.error('[settings] reregister failed', e));
  }
  return cache!;
}

export async function setOpenAiKey(key: string | null): Promise<void> {
  if (key && key.trim()) await setSecret('openai:api-key', key.trim());
  else await deleteSecret('openai:api-key');
  resetOpenaiClient();
  cache = null;
  broadcast(await load());
}

export async function setDeepgramKey(key: string | null): Promise<void> {
  if (key && key.trim()) await setSecret('deepgram:api-key', key.trim());
  else await deleteSecret('deepgram:api-key');
  cache = null;
  broadcast(await load());
}

export async function getDeepgramKey(): Promise<string> {
  const byok = await getSecret('deepgram:api-key').catch(() => null);
  return byok || process.env.DEEPGRAM_API_KEY || '';
}

export async function clearAllUserData(): Promise<void> {
  await clearAllSecrets();
  try { await fs.unlink(SETTINGS_PATH); } catch {/* */}
  cache = null;
  resetOpenaiClient();
}
