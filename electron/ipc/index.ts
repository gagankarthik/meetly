import { ipcMain, BrowserWindow, desktopCapturer } from 'electron';
import { IpcChannel } from '@shared/types';
import { getOverlayWindow, setOverlayHeight, setOverlaySize, createOverlayWindow, setOverlayClickThrough } from '../windows/overlay';
import { createAuthWindow, closeAuthWindow } from '../windows/auth';
import { createLibraryWindow } from '../windows/library';
import { createSettingsWindow } from '../windows/settings';
import { createHubWindow, getHubWindow } from '../windows/hub';
import * as cognito from '../services/cognito';
import * as ddb from '../services/dynamodb';
import * as dg from '../services/deepgram';
import * as ai from '../services/openai';
import * as insights from '../services/insights';
import * as settings from '../services/settings';
import { captureScreen } from '../services/screenshot';
import { clearCredentialCache } from '../services/credentials';

export function registerIpcHandlers() {
  // ===== Window control =====
  ipcMain.handle(IpcChannel.WindowSetIgnoreMouse, (_, { ignore, forward }: { ignore: boolean; forward?: boolean }) => {
    const w = getOverlayWindow();
    if (!w) return;
    w.setIgnoreMouseEvents(ignore, forward !== undefined ? { forward } : undefined);
  });
  ipcMain.handle(IpcChannel.WindowToggleOverlay, () => {
    const w = getOverlayWindow() ?? createOverlayWindow();
    if (w.isVisible()) w.hide(); else { w.show(); w.focus(); }
  });
  // Auth-gated openers: if there's no session, route the user to sign in first.
  const gatedOpen = async (opener: () => void) => {
    const s = await cognito.getSession().catch(() => null);
    if (!s) { createAuthWindow(); return; }
    opener();
  };

  ipcMain.handle(IpcChannel.WindowOpenLibrary,  () => gatedOpen(() => createLibraryWindow()));
  ipcMain.handle(IpcChannel.WindowOpenAuth,     () => { createAuthWindow(); });
  ipcMain.handle(IpcChannel.WindowOpenHub,      () => gatedOpen(() => createHubWindow()));
  ipcMain.handle(IpcChannel.WindowOpenSettings, () => gatedOpen(() => createSettingsWindow()));
  ipcMain.handle(IpcChannel.WindowHideHub,      () => { getHubWindow()?.hide(); });
  ipcMain.handle(IpcChannel.WindowShowHub,      () => gatedOpen(() => {
    const w = getHubWindow() ?? createHubWindow();
    w.show(); w.focus();
  }));
  ipcMain.handle(IpcChannel.WindowCloseOverlay, () => { getOverlayWindow()?.close(); });
  ipcMain.handle(IpcChannel.WindowStartMeeting, () => gatedOpen(() => {
    getHubWindow()?.hide();
    createOverlayWindow({ autostart: true });
  }));
  ipcMain.handle(IpcChannel.WindowSetHeight, (_, h: number) => setOverlayHeight(h));
  ipcMain.handle(IpcChannel.WindowSetSize,   (_, { width, height }: { width: number; height: number }) => setOverlaySize(width, height));

  // ===== Auth =====
  ipcMain.handle(IpcChannel.AuthSignIn, async (_, { email, password }: { email: string; password: string }) => {
    try {
      const session = await cognito.signIn(email, password);
      closeAuthWindow();
      createHubWindow();
      return { ok: true, session };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Sign in failed', reason: err?.name };
    }
  });
  ipcMain.handle(IpcChannel.AuthSignUp, async (_, { email, password, displayName }) => {
    try {
      const session = await cognito.signUp(email, password, displayName);
      closeAuthWindow();
      createHubWindow();
      return { ok: true, session };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Sign up failed' };
    }
  });
  ipcMain.handle(IpcChannel.AuthSignOut, async () => {
    await cognito.signOut();
    clearCredentialCache();
    BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.close(); });
    createAuthWindow();
  });
  ipcMain.handle(IpcChannel.AuthGetSession, () => cognito.getSession());

  // ===== Meetings — respect "save transcripts" privacy toggle =====
  ipcMain.handle(IpcChannel.MeetingCreate, (_, input) => ddb.createMeeting(input));
  ipcMain.handle(IpcChannel.MeetingList,   () => ddb.listMeetings());
  ipcMain.handle(IpcChannel.MeetingGet,    (_, id) => ddb.getMeeting(id));
  ipcMain.handle(IpcChannel.MeetingUpdate, (_, m) => ddb.updateMeeting(m));
  ipcMain.handle(IpcChannel.MeetingDelete, (_, id) => ddb.deleteMeeting(id));
  ipcMain.handle(IpcChannel.MeetingSaveTranscript, (_, { meetingId, segments }) =>
    ddb.saveTranscript(meetingId, segments));
  ipcMain.handle(IpcChannel.MeetingSaveSummary, (_, { meetingId, summary }) =>
    ddb.saveSummary(meetingId, summary));
  ipcMain.handle(IpcChannel.MeetingLoadTranscript, (_, meetingId) => ddb.loadTranscript(meetingId));
  ipcMain.handle(IpcChannel.MeetingLoadSummary,    (_, meetingId) => ddb.loadSummary(meetingId));

  // ===== Audio sources =====
  ipcMain.handle(IpcChannel.AudioListSources, async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  });

  // ===== Deepgram =====
  ipcMain.handle(IpcChannel.TranscribeStart, async (_, { meetingId, sampleRate, channels, mode, briefing }) => {
    try {
      await dg.start(meetingId, sampleRate, channels);
      insights.startInsightsLoop({ meetingId, mode, briefing });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Transcription failed to start' };
    }
  });
  ipcMain.handle(IpcChannel.TranscribeChunk, (_, buffer: ArrayBuffer) => dg.chunk(buffer));
  ipcMain.handle(IpcChannel.TranscribeStop, async () => {
    insights.stopInsightsLoop();
    await dg.stop();
  });
  ipcMain.handle(IpcChannel.InsightsUpdateContext, (_, patch) => insights.updateInsightContext(patch));

  // ===== OpenAI =====
  ipcMain.handle(IpcChannel.AiAsk, (_, input) => ai.ask(input));
  ipcMain.handle(IpcChannel.AiSummarize, (_, { meetingId }) => ai.summarize(meetingId));
  ipcMain.handle(IpcChannel.AiCaptureScreenshot, async () => {
    return { base64: await captureScreen() };
  });

  // ===== Settings =====
  ipcMain.handle(IpcChannel.SettingsGet, () => settings.getSettings());
  ipcMain.handle(IpcChannel.SettingsUpdate, async (_, patch) => {
    const next = await settings.updateSettings(patch);
    // Apply side-effects: click-through, content protection
    if ('clickThrough' in patch) setOverlayClickThrough(next.clickThrough);
    return next;
  });
  ipcMain.handle(IpcChannel.SettingsSetOpenAiKey, async (_, key: string | null) => {
    await settings.setOpenAiKey(key);
    return settings.getSettings();
  });
  ipcMain.handle(IpcChannel.SettingsSetDeepgramKey, async (_, key: string | null) => {
    await settings.setDeepgramKey(key);
    return settings.getSettings();
  });
  ipcMain.handle(IpcChannel.SettingsClearAllData, async () => {
    await settings.clearAllUserData();
    return settings.getSettings();
  });
}
