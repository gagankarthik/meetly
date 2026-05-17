import { create } from 'zustand';
import type { MeetingMode } from '@shared/types';

interface BriefingState {
  title: string;
  mode: MeetingMode;
  context: string;
  setTitle:   (v: string) => void;
  setMode:    (v: MeetingMode) => void;
  setContext: (v: string) => void;
  reset:      () => void;
}

export const useBriefing = create<BriefingState>((set) => ({
  title: '',
  mode: 'general',
  context: '',
  setTitle:   (title)   => set({ title }),
  setMode:    (mode)    => set({ mode }),
  setContext: (context) => set({ context }),
  reset: () => set({ title: '', context: '' }),
}));
