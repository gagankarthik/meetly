import { BrowserWindow, app } from 'electron';
import path from 'node:path';

let settings: BrowserWindow | null = null;

export function createSettingsWindow(): BrowserWindow {
  if (settings && !settings.isDestroyed()) {
    settings.show(); settings.focus();
    return settings;
  }

  settings = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 680,
    minHeight: 520,
    title: 'Meetly — Settings',
    icon: path.join(__dirname, '../../resources/icon.png'),
    backgroundColor: '#FAFAF7',
    frame: true,
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
    settings.loadFile(path.join(__dirname, '../../dist/settings.html'));
  } else {
    settings.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings.html`);
  }

  settings.once('ready-to-show', () => settings?.show());
  settings.on('closed', () => { settings = null; });
  return settings;
}

export function getSettingsWindow(): BrowserWindow | null {
  return settings && !settings.isDestroyed() ? settings : null;
}
