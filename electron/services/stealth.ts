import { BrowserWindow } from 'electron';

// Makes the window invisible to screen-share / screen recordings.
// macOS: NSWindowSharingNone via setContentProtection
// Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) — also via setContentProtection in Electron 22+
// Linux: best-effort, varies by compositor
export function applyStealth(win: BrowserWindow): void {
  const disabled = process.env.VITE_DEV_DISABLE_STEALTH === 'true';
  if (disabled) return;
  try {
    win.setContentProtection(true);
  } catch (err) {
    console.warn('[stealth] setContentProtection failed', err);
  }
}

export function setStealth(win: BrowserWindow, enabled: boolean): void {
  try {
    win.setContentProtection(enabled);
  } catch (err) {
    console.warn('[stealth] toggle failed', err);
  }
}
