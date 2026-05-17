import { BrowserWindow, app } from 'electron';
import path from 'node:path';

let library: BrowserWindow | null = null;

export function createLibraryWindow(): BrowserWindow {
  if (library && !library.isDestroyed()) {
    library.show(); library.focus();
    return library;
  }

  library = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 560,
    title: 'Meetly — Library',
    icon: path.join(__dirname, '../../resources/icon.png'),
    backgroundColor: '#FAFAF7',
    frame: true,                   // native title bar with min/max/close
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
    library.loadFile(path.join(__dirname, '../../dist/library.html'));
  } else {
    library.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/library.html`);
  }

  library.once('ready-to-show', () => library?.show());
  library.on('closed', () => { library = null; });
  return library;
}

export function getLibraryWindow(): BrowserWindow | null {
  return library && !library.isDestroyed() ? library : null;
}
