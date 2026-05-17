import { create } from 'zustand';
import type { AuthSession } from '@shared/types';

interface AuthState {
  session: AuthSession | null;
  loading: boolean;
  setSession: (s: AuthSession | null) => void;
  setLoading: (b: boolean) => void;
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  loading: true,
  setSession: (s) => set({ session: s, loading: false }),
  setLoading: (b) => set({ loading: b }),
}));
