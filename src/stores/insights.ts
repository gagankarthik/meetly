import { create } from 'zustand';
import type { AIInsight } from '@shared/types';

interface InsightsState {
  items: AIInsight[];
  add: (i: AIInsight) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

const MAX_VISIBLE = 4;

export const useInsights = create<InsightsState>((set, get) => ({
  items: [],
  add: (i) => {
    const next = [i, ...get().items].slice(0, MAX_VISIBLE);
    set({ items: next });
  },
  dismiss: (id) => set({ items: get().items.filter((x) => x.id !== id) }),
  clear: () => set({ items: [] }),
}));
