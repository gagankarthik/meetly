// Global keyboard shortcut registration. Called once on bootstrap and again any
// time the user remaps a hotkey in Settings, so changes take effect without restart.
import { globalShortcut } from 'electron';
import { IpcChannel } from '@shared/types';
import { getOverlayWindow, createOverlayWindow } from '../windows/overlay';
import { getSettings } from './settings';

export async function registerGlobalShortcuts(): Promise<void> {
  globalShortcut.unregisterAll();
  const s = await getSettings();

  safeRegister(s.hotkeyToggle, () => {
    const overlay = getOverlayWindow() ?? createOverlayWindow();
    if (overlay.isVisible()) overlay.hide();
    else { overlay.show(); overlay.focus(); }
    overlay.webContents.send(IpcChannel.HotkeyToggle);
  });

  safeRegister(s.hotkeyAsk, () => {
    const overlay = getOverlayWindow() ?? createOverlayWindow();
    overlay.show();
    overlay.focus();
    overlay.webContents.send(IpcChannel.HotkeyAsk);
  });

  safeRegister(s.hotkeyScreenshot, () => {
    const overlay = getOverlayWindow() ?? createOverlayWindow();
    overlay.show();
    overlay.focus();
    overlay.webContents.send(IpcChannel.HotkeyScreenshot);
  });

  safeRegister(s.hotkeyHide, () => {
    getOverlayWindow()?.hide();
  });
}

function safeRegister(accelerator: string, handler: () => void) {
  if (!accelerator) return;
  try {
    globalShortcut.register(accelerator, handler);
  } catch (e) {
    console.error('[shortcuts] failed to register', accelerator, e);
  }
}
