import { BrowserWindow, screen, app } from 'electron';
import path from 'node:path';
import { applyStealth } from '../services/stealth';

let overlay: BrowserWindow | null = null;

const WIDTH = 640;
const DEFAULT_HEIGHT = 700;
const MIN_WIDTH = 400;
const MAX_WIDTH = 1100;
const MIN_HEIGHT = 64;     // low enough for the collapsed pill-only state
const MAX_HEIGHT = 1200;

export function createOverlayWindow(opts: { autostart?: boolean } = {}): BrowserWindow {
  if (overlay && !overlay.isDestroyed()) {
    if (opts.autostart) overlay.webContents.send('overlay:autostart');
    return overlay;
  }

  const primary = screen.getPrimaryDisplay();
  const { workArea } = primary;
  const x = Math.round(workArea.x + workArea.width - WIDTH - 24);
  const y = Math.round(workArea.y + 64);

  overlay = new BrowserWindow({
    width: WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    icon: path.join(__dirname, '../../resources/icon.png'),
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // keytar / native modules in main, but preload may need fs
      backgroundThrottling: false,
    },
    show: false,
  });

  // Highest on-top level — above fullscreen + screen-share toolbars on macOS
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  applyStealth(overlay);

  const query = opts.autostart ? '?autostart=1' : '';
  if (app.isPackaged) {
    overlay.loadFile(path.join(__dirname, '../../dist/overlay.html'), { search: opts.autostart ? 'autostart=1' : '' });
  } else {
    overlay.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html${query}`);
  }

  overlay.once('ready-to-show', () => overlay?.show());

  overlay.on('closed', () => { overlay = null; });

  return overlay;
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlay && !overlay.isDestroyed() ? overlay : null;
}

export function setOverlayHeight(h: number) {
  const w = getOverlayWindow();
  if (!w) return;
  const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(h)));
  const [width] = w.getSize();
  w.setSize(width, clamped, true);
}

export function setOverlaySize(width: number, height: number) {
  const w = getOverlayWindow();
  if (!w) return;
  const cw = Math.max(MIN_WIDTH,  Math.min(MAX_WIDTH,  Math.round(width)));
  const ch = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)));
  w.setSize(cw, ch, true);
}


// Read-mode: cursor passes through. `forward: true` still lets us track moves so
// React can show hover affordance for the ask input area.
export function setOverlayClickThrough(enabled: boolean) {
  const w = getOverlayWindow();
  if (!w) return;
  w.setIgnoreMouseEvents(enabled, enabled ? { forward: true } : undefined);
}
