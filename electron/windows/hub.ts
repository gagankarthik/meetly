import { BrowserWindow, app } from 'electron';
import path from 'node:path';

let hub: BrowserWindow | null = null;

export function createHubWindow(): BrowserWindow {
  if (hub && !hub.isDestroyed()) {
    hub.show(); hub.focus();
    return hub;
  }

  hub = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 880,
    minHeight: 560,
    title: 'Meetly',
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
    hub.loadFile(path.join(__dirname, '../../dist/hub.html'));
  } else {
    hub.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/hub.html`);
  }

  hub.once('ready-to-show', () => hub?.show());
  hub.on('closed', () => { hub = null; });
  return hub;
}

export function getHubWindow(): BrowserWindow | null {
  return hub && !hub.isDestroyed() ? hub : null;
}
