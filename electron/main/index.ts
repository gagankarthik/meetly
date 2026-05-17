import { app, globalShortcut, Tray, Menu, nativeImage, BrowserWindow, dialog } from 'electron';
import { config as loadDotenv } from 'dotenv';
import { createOverlayWindow, getOverlayWindow } from '../windows/overlay';
import { createAuthWindow } from '../windows/auth';
import { createLibraryWindow, getLibraryWindow } from '../windows/library';
import { createSettingsWindow, getSettingsWindow } from '../windows/settings';
import { createHubWindow, getHubWindow } from '../windows/hub';
import { registerIpcHandlers } from '../ipc';
import { getSession, signOut } from '../services/cognito';
import { clearCredentialCache } from '../services/credentials';
import { registerGlobalShortcuts } from '../services/shortcuts';
import { assertProductionConfig, config } from '../services/config';

// Dev only: load .env.local for the values vite couldn't bake (none in
// production builds, since all required vars are inlined by vite's define).
// Packaged builds never read .env from disk — config comes from baked constants.
if (!app.isPackaged) {
  loadDotenv({ path: '.env.local' });
  loadDotenv();
}

// Hard guarantee: in a shipped binary, DEV_SKIP_AUTH cannot be flipped on by
// tampering with the user's env. config.devSkipAuth also enforces this, but
// belt-and-braces.
if (app.isPackaged) {
  delete process.env.DEV_SKIP_AUTH;
  delete process.env.AWS_ADMIN_ACCESS_KEY_ID;
  delete process.env.AWS_ADMIN_SECRET_ACCESS_KEY;
}

// Override the default "Electron" name shown by the OS in dev mode.
app.setName('Meetly');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.oceanblue.meetly');
}

const isDev = !app.isPackaged;

let tray: Tray | null = null;

// Single instance only
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  const hub = getHubWindow();
  if (hub) { hub.show(); hub.focus(); return; }
  const overlay = getOverlayWindow();
  if (overlay) { overlay.show(); overlay.focus(); }
});

// Disable hardware acceleration check on Linux — not needed on Win/Mac
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
// Needed for system-audio loopback capture on some setups
app.commandLine.appendSwitch('enable-blink-features', 'GetDisplayMedia');

async function bootstrap() {
  // Fail loudly if the installer was built without baked AWS config — better
  // than letting the user hit "Sign in" and get a cryptic error mid-flow.
  const check = assertProductionConfig();
  if (!check.ok) {
    dialog.showErrorBox(
      'Meetly is misconfigured',
      `This installer was built without required AWS configuration:\n  • ${check.missing.join('\n  • ')}\n\n` +
      'This is a build problem — please reach out to support.',
    );
    app.quit();
    return;
  }

  registerIpcHandlers();

  // Hub is the home base. Overlay is opened on demand (New meeting button or hotkey).
  const session = await getSession().catch(() => null);
  if (session) {
    createHubWindow();
  } else {
    createAuthWindow();
  }

  registerGlobalShortcuts();
  installTray();
}


function installTray() {
  const iconPath = require('node:path').join(__dirname, '../../resources/icon.png');
  const full = nativeImage.createFromPath(iconPath);
  // Tray icons render best around 16-22px; resize for crisp display.
  const icon = full.isEmpty() ? nativeImage.createEmpty() : full.resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('Meetly');

  const authBypass = config.devSkipAuth;

  // Auth gate: if not signed in, every tray action routes to the Auth window.
  const gated = (opener: () => void) => async () => {
    const session = await getSession().catch(() => null);
    if (!session) {
      const w = createAuthWindow();
      w.show(); w.focus();
      return;
    }
    opener();
  };

  const buildMenu = () => Menu.buildFromTemplate([
    { label: 'Open Meetly', click: gated(() => {
        const w = getHubWindow() ?? createHubWindow();
        w.show(); w.focus();
      }) },
    { label: 'New meeting  (overlay)  (⌘\\)', click: gated(() => {
        const w = getOverlayWindow() ?? createOverlayWindow();
        w.show(); w.focus();
      }) },
    { type: 'separator' },
    { label: 'Transcripts', click: gated(() => {
        const w = getLibraryWindow() ?? createLibraryWindow();
        w.show(); w.focus();
      }) },
    { label: 'Settings…', click: gated(() => {
        const w = getSettingsWindow() ?? createSettingsWindow();
        w.show(); w.focus();
      }) },
    ...(authBypass ? [] : [
      { type: 'separator' as const },
      { label: 'Sign out', click: async () => {
          await signOut();
          clearCredentialCache();
          BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.close(); });
          createAuthWindow();
        } },
    ]),
    { type: 'separator' },
    { label: 'Quit Meetly', click: () => app.quit() },
  ]);
  tray.setContextMenu(buildMenu());
}

app.whenReady().then(bootstrap);

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep app alive in tray (don't quit when last window closes)
});

if (isDev) {
  // Hot-reload friendly — log unhandled errors so they're visible
  process.on('uncaughtException', (err) => console.error('[main]', err));
  process.on('unhandledRejection', (err) => console.error('[main]', err));
}

export { isDev };
