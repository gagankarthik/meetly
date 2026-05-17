import { BrowserWindow, app } from 'electron';
import path from 'node:path';

let auth: BrowserWindow | null = null;

export function createAuthWindow(): BrowserWindow {
  if (auth && !auth.isDestroyed()) {
    auth.show(); auth.focus();
    return auth;
  }

  auth = new BrowserWindow({
    width: 460,
    height: 660,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'Meetly',
    icon: path.join(__dirname, '../../resources/icon.png'),
    backgroundColor: '#FAFAF7',
    frame: true,                   // native title bar with min/close
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  if (app.isPackaged) {
    auth.loadFile(path.join(__dirname, '../../dist/auth.html'));
  } else {
    auth.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/auth.html`);
  }

  auth.once('ready-to-show', () => auth?.show());
  auth.on('closed', () => { auth = null; });
  return auth;
}

export function getAuthWindow(): BrowserWindow | null {
  return auth && !auth.isDestroyed() ? auth : null;
}

export function closeAuthWindow() {
  if (auth && !auth.isDestroyed()) auth.close();
  auth = null;
}
