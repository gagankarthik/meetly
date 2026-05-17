// Shared types between main and renderer processes.

export type WindowKind = 'overlay' | 'auth' | 'library' | 'settings';

export type MeetingMode = 'general' | 'interview' | 'sales' | 'standup';

export interface MeetingBriefing {
  title: string;
  mode: MeetingMode;
  context?: string;     // free-form notes pasted by the user
}

export type KeySource = 'keychain' | 'env' | null;

export interface UserSettings {
  // AI
  openaiKeyConfigured: boolean;  // true if EITHER keychain or env has it
  deepgramKeyConfigured: boolean;
  openaiKeySource: KeySource;    // where the active key actually comes from
  deepgramKeySource: KeySource;
  defaultMode: MeetingMode;
  // Privacy
  saveTranscripts: boolean;     // false = nothing persisted to DynamoDB
  telemetryOptIn: boolean;       // always false unless explicit; reserved
  clickThrough: boolean;         // overlay passes mouse events through
  contentProtection: boolean;    // invisible to screen-share
  // Hotkeys
  hotkeyToggle: string;
  hotkeyAsk: string;
  hotkeyScreenshot: string;
  hotkeyHide: string;
  // Audio
  preferredMicId?: string;
}

export interface TranscriptWord {
  word: string;
  start: number;        // seconds
  end: number;
  speaker?: number;     // diarization channel
  confidence: number;
}

export interface TranscriptSegment {
  id: string;
  speaker: string;      // resolved label e.g. "You", "Speaker 1"
  text: string;
  startTime: number;    // ms from meeting start
  endTime: number;
  isFinal: boolean;
}

export interface AIInsight {
  id: string;
  kind: 'suggestion' | 'fact' | 'objection-answer' | 'question';
  title: string;
  body: string;
  citationSegmentIds?: string[];
  createdAt: number;
}

export interface MeetingRecord {
  id: string;
  userId: string;
  title: string;
  startedAt: number;    // epoch ms
  endedAt?: number;
  durationSec?: number;
  participants?: string[];
  status: 'recording' | 'processing' | 'ready' | 'failed';
  // detail blob refs (loaded on demand)
  hasTranscript: boolean;
  hasSummary: boolean;
}

export interface MeetingSummary {
  meetingId: string;
  oneLine: string;
  bullets: string[];
  decisions: string[];
  actionItems: { owner?: string; text: string; due?: string }[];
  generatedAt: number;
  model: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  displayName?: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;    // epoch ms
}

// IPC channel names — typed via Ipc map below.
export const IpcChannel = {
  // window control
  WindowSetIgnoreMouse: 'window:set-ignore-mouse',
  WindowToggleOverlay:  'window:toggle-overlay',
  WindowOpenLibrary:    'window:open-library',
  WindowOpenAuth:       'window:open-auth',
  WindowOpenHub:        'window:open-hub',
  WindowHideHub:        'window:hide-hub',
  WindowShowHub:        'window:show-hub',
  WindowCloseOverlay:   'window:close-overlay',
  WindowStartMeeting:   'window:start-meeting',  // open overlay + autostart recording
  WindowDragStart:      'window:drag-start',
  WindowSetHeight:      'window:set-height',
  WindowSetSize:        'window:set-size',

  // auth
  AuthSignIn:           'auth:sign-in',
  AuthSignUp:           'auth:sign-up',
  AuthConfirmSignUp:    'auth:confirm-sign-up',
  AuthSignOut:          'auth:sign-out',
  AuthGetSession:       'auth:get-session',
  AuthSessionChanged:   'auth:session-changed', // main -> renderer

  // meetings (DynamoDB)
  MeetingCreate:        'meeting:create',
  MeetingList:          'meeting:list',
  MeetingGet:           'meeting:get',
  MeetingUpdate:        'meeting:update',
  MeetingDelete:        'meeting:delete',
  MeetingSaveTranscript:'meeting:save-transcript',
  MeetingSaveSummary:   'meeting:save-summary',
  MeetingLoadTranscript:'meeting:load-transcript',
  MeetingLoadSummary:   'meeting:load-summary',

  // audio + transcription
  AudioListSources:     'audio:list-sources',
  TranscribeStart:      'transcribe:start',
  TranscribeChunk:      'transcribe:chunk',
  TranscribeStop:       'transcribe:stop',
  TranscribeSegment:    'transcribe:segment',   // main -> renderer
  InsightsUpdateContext:'insights:update-context',

  // AI
  AiAsk:                'ai:ask',
  AiAskChunk:           'ai:ask-chunk',         // main -> renderer
  AiSummarize:          'ai:summarize',
  AiInsight:            'ai:insight',           // proactive, main -> renderer
  AiCaptureScreenshot:  'ai:capture-screenshot',

  // Settings
  SettingsGet:          'settings:get',
  SettingsUpdate:       'settings:update',
  SettingsChanged:      'settings:changed',     // main -> all renderers
  SettingsSetOpenAiKey: 'settings:set-openai-key',
  SettingsSetDeepgramKey: 'settings:set-deepgram-key',
  SettingsClearAllData: 'settings:clear-all-data',
  WindowOpenSettings:   'window:open-settings',

  // Briefing — held in renderer state, but the active briefing is sent with ai:ask

  // hotkey forwarded events
  HotkeyToggle:         'hotkey:toggle',
  HotkeyAsk:            'hotkey:ask',
  HotkeyHide:           'hotkey:hide',
  HotkeyScreenshot:     'hotkey:screenshot',
  HotkeyClickThrough:   'hotkey:click-through',
} as const;

export type IpcChannelKey = typeof IpcChannel[keyof typeof IpcChannel];
