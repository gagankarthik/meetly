import { create } from 'zustand';
import type { MeetingRecord, TranscriptSegment } from '@shared/types';

interface MeetingState {
  current: MeetingRecord | null;
  startedAt: number | null;
  elapsedSec: number;
  status: 'idle' | 'recording' | 'paused' | 'processing' | 'finished';
  segments: TranscriptSegment[];
  micLevel: number;
  sysLevel: number;
  setCurrent: (m: MeetingRecord | null) => void;
  setStatus:  (s: MeetingState['status']) => void;
  tickElapsed: () => void;
  upsertSegment: (seg: TranscriptSegment) => void;
  resetSegments: () => void;
  setLevels: (mic: number, sys: number) => void;
}

export const useMeeting = create<MeetingState>((set, get) => ({
  current: null,
  startedAt: null,
  elapsedSec: 0,
  status: 'idle',
  segments: [],
  micLevel: 0,
  sysLevel: 0,

  setCurrent: (m) => set({ current: m, startedAt: m ? Date.now() : null, elapsedSec: 0 }),
  setStatus:  (status) => set({ status }),
  tickElapsed: () => {
    const startedAt = get().startedAt;
    if (!startedAt) return;
    set({ elapsedSec: Math.floor((Date.now() - startedAt) / 1000) });
  },

  upsertSegment: (seg) => {
    const segs = get().segments.slice();
    // Replace any non-final segment with the same speaker that's still being updated
    const lastIdx = segs.length - 1;
    if (lastIdx >= 0 && !segs[lastIdx].isFinal && segs[lastIdx].speaker === seg.speaker) {
      segs[lastIdx] = seg;
    } else if (seg.isFinal) {
      // Drop trailing interim that this final supersedes
      if (lastIdx >= 0 && !segs[lastIdx].isFinal) segs.pop();
      segs.push(seg);
    } else {
      segs.push(seg);
    }
    set({ segments: segs });
  },

  resetSegments: () => set({ segments: [] }),
  setLevels: (mic, sys) => set({ micLevel: mic, sysLevel: sys }),
}));
