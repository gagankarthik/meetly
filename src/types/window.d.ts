import type { MeetlyApi } from '../../electron/preload';

declare global {
  interface Window {
    meetly: MeetlyApi;
  }
}

export {};
