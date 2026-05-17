import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IpcChannel } from '@shared/types';
import type {
  MeetingRecord,
  MeetingSummary,
  TranscriptSegment,
  AIInsight,
  AuthSession,
  UserSettings,
  MeetingMode,
} from '@shared/types';

type Listener<T> = (payload: T) => void;

const api = {
  // window control
  window: {
    setIgnoreMouse: (ignore: boolean, opts?: { forward?: boolean }) =>
      ipcRenderer.invoke(IpcChannel.WindowSetIgnoreMouse, { ignore, ...opts }),
    toggleOverlay: () => ipcRenderer.invoke(IpcChannel.WindowToggleOverlay),
    openLibrary:   () => ipcRenderer.invoke(IpcChannel.WindowOpenLibrary),
    openAuth:      () => ipcRenderer.invoke(IpcChannel.WindowOpenAuth),
    openHub:       () => ipcRenderer.invoke(IpcChannel.WindowOpenHub),
    openSettings:  () => ipcRenderer.invoke(IpcChannel.WindowOpenSettings),
    hideHub:       () => ipcRenderer.invoke(IpcChannel.WindowHideHub),
    showHub:       () => ipcRenderer.invoke(IpcChannel.WindowShowHub),
    closeOverlay:  () => ipcRenderer.invoke(IpcChannel.WindowCloseOverlay),
    startMeeting:  () => ipcRenderer.invoke(IpcChannel.WindowStartMeeting),
    onAutostart:   (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on('overlay:autostart', h);
      return () => { ipcRenderer.removeListener('overlay:autostart', h); };
    },
    setHeight:     (h: number) => ipcRenderer.invoke(IpcChannel.WindowSetHeight, h),
  },

  auth: {
    signIn:  (input: { email: string; password: string }) =>
      ipcRenderer.invoke(IpcChannel.AuthSignIn, input) as Promise<{ ok: true; session: AuthSession } | { ok: false; error: string; reason?: string }>,
    signUp:  (input: { email: string; password: string; displayName?: string }) =>
      ipcRenderer.invoke(IpcChannel.AuthSignUp, input) as Promise<{ ok: true; session: AuthSession } | { ok: false; error: string }>,
    signOut: () => ipcRenderer.invoke(IpcChannel.AuthSignOut),
    getSession: () => ipcRenderer.invoke(IpcChannel.AuthGetSession) as Promise<AuthSession | null>,
    onSessionChanged: (cb: Listener<AuthSession | null>) => subscribe(IpcChannel.AuthSessionChanged, cb),
  },

  meetings: {
    create: (input: { title: string }) =>
      ipcRenderer.invoke(IpcChannel.MeetingCreate, input) as Promise<MeetingRecord>,
    list:   () => ipcRenderer.invoke(IpcChannel.MeetingList) as Promise<MeetingRecord[]>,
    get:    (id: string) => ipcRenderer.invoke(IpcChannel.MeetingGet, id) as Promise<MeetingRecord | null>,
    update: (m: Partial<MeetingRecord> & { id: string }) => ipcRenderer.invoke(IpcChannel.MeetingUpdate, m),
    delete: (id: string) => ipcRenderer.invoke(IpcChannel.MeetingDelete, id),
    saveTranscript: (input: { meetingId: string; segments: TranscriptSegment[] }) =>
      ipcRenderer.invoke(IpcChannel.MeetingSaveTranscript, input),
    saveSummary: (input: { meetingId: string; summary: MeetingSummary }) =>
      ipcRenderer.invoke(IpcChannel.MeetingSaveSummary, input),
    loadTranscript: (meetingId: string) =>
      ipcRenderer.invoke(IpcChannel.MeetingLoadTranscript, meetingId) as Promise<TranscriptSegment[]>,
    loadSummary: (meetingId: string) =>
      ipcRenderer.invoke(IpcChannel.MeetingLoadSummary, meetingId) as Promise<MeetingSummary | null>,
  },

  audio: {
    listSources: () => ipcRenderer.invoke(IpcChannel.AudioListSources) as Promise<{ id: string; name: string }[]>,
  },

  transcribe: {
    start: (input: { meetingId: string; sampleRate: number; channels: number; mode?: MeetingMode; briefing?: string }) =>
      ipcRenderer.invoke(IpcChannel.TranscribeStart, input) as Promise<{ ok: true } | { ok: false; error: string }>,
    chunk: (buffer: ArrayBuffer) => ipcRenderer.invoke(IpcChannel.TranscribeChunk, buffer),
    stop:  () => ipcRenderer.invoke(IpcChannel.TranscribeStop),
    onSegment: (cb: Listener<TranscriptSegment>) => subscribe(IpcChannel.TranscribeSegment, cb),
  },

  insights: {
    updateContext: (patch: { mode?: MeetingMode; briefing?: string }) =>
      ipcRenderer.invoke(IpcChannel.InsightsUpdateContext, patch),
  },

  ai: {
    ask: (input: {
      question: string;
      meetingId?: string;
      contextSegments?: TranscriptSegment[];
      mode?: MeetingMode;
      briefing?: string;
      screenshotBase64?: string;
    }) => ipcRenderer.invoke(IpcChannel.AiAsk, input) as Promise<{ requestId: string }>,
    onChunk: (cb: Listener<{ requestId: string; delta: string; done?: boolean }>) =>
      subscribe(IpcChannel.AiAskChunk, cb),
    summarize: (meetingId: string) =>
      ipcRenderer.invoke(IpcChannel.AiSummarize, { meetingId }) as Promise<MeetingSummary>,
    onInsight:  (cb: Listener<AIInsight>) => subscribe(IpcChannel.AiInsight, cb),
    captureScreenshot: () =>
      ipcRenderer.invoke(IpcChannel.AiCaptureScreenshot) as Promise<{ base64: string }>,
  },

  settings: {
    get: () => ipcRenderer.invoke(IpcChannel.SettingsGet) as Promise<UserSettings>,
    update: (patch: Partial<UserSettings>) =>
      ipcRenderer.invoke(IpcChannel.SettingsUpdate, patch) as Promise<UserSettings>,
    setOpenAiKey:   (key: string | null) => ipcRenderer.invoke(IpcChannel.SettingsSetOpenAiKey, key) as Promise<UserSettings>,
    setDeepgramKey: (key: string | null) => ipcRenderer.invoke(IpcChannel.SettingsSetDeepgramKey, key) as Promise<UserSettings>,
    clearAllData:   () => ipcRenderer.invoke(IpcChannel.SettingsClearAllData) as Promise<UserSettings>,
    onChanged: (cb: Listener<UserSettings>) => subscribe(IpcChannel.SettingsChanged, cb),
  },

  hotkey: {
    onToggle:     (cb: () => void) => subscribe(IpcChannel.HotkeyToggle, cb),
    onAsk:        (cb: () => void) => subscribe(IpcChannel.HotkeyAsk, cb),
    onHide:       (cb: () => void) => subscribe(IpcChannel.HotkeyHide, cb),
    onScreenshot: (cb: () => void) => subscribe(IpcChannel.HotkeyScreenshot, cb),
  },

  platform: process.platform,
  isDev: !process.env.npm_package_version || process.env.NODE_ENV === 'development',
};

function subscribe<T>(channel: string, cb: Listener<T>) {
  const handler = (_: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.removeListener(channel, handler); };
}

contextBridge.exposeInMainWorld('meetly', api);

export type MeetlyApi = typeof api;
