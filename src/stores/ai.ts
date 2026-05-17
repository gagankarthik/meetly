import { create } from 'zustand';
import { nanoid } from 'nanoid';

export interface AskTurn {
  id: string;
  requestId?: string;
  question: string;
  answer: string;
  status: 'streaming' | 'done' | 'error';
  createdAt: number;
}

interface AiState {
  turns: AskTurn[];
  isAsking: boolean;
  newAsk: (question: string) => AskTurn;
  setRequestId: (id: string, requestId: string) => void;
  appendDelta: (requestId: string, delta: string) => void;
  finalize: (requestId: string) => void;
  clear: () => void;
}

export const useAi = create<AiState>((set, get) => ({
  turns: [],
  isAsking: false,

  newAsk: (question) => {
    const turn: AskTurn = {
      id: nanoid(8),
      question,
      answer: '',
      status: 'streaming',
      createdAt: Date.now(),
    };
    set({ turns: [...get().turns, turn], isAsking: true });
    return turn;
  },

  setRequestId: (id, requestId) => {
    set({
      turns: get().turns.map((t) => (t.id === id ? { ...t, requestId } : t)),
    });
  },

  appendDelta: (requestId, delta) => {
    set({
      turns: get().turns.map((t) =>
        t.requestId === requestId ? { ...t, answer: t.answer + delta } : t,
      ),
    });
  },

  finalize: (requestId) => {
    set({
      isAsking: false,
      turns: get().turns.map((t) =>
        t.requestId === requestId ? { ...t, status: 'done' } : t,
      ),
    });
  },

  clear: () => set({ turns: [], isAsking: false }),
}));
