import { create } from 'zustand';
import type { User } from '../api/types';
import { apiClient } from '../api/client';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User | null) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  login: (response: any) => void;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const defaults = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

export const useAuthStore = create<AuthState>()(
  (set) => ({
    ...defaults,

    setUser: (user) => set({ user }),
    setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
    setLoading: (isLoading) => set({ isLoading }),

    login: (response: any) => {
      if (response.pre_auth_token) {
        set({
          user: response.user,
          isAuthenticated: false,
          isLoading: false,
        });
      } else {
        set({
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
        });
      }
    },

    logout: async () => {
      try {
        await apiClient.post('/api/auth/logout/');
      } catch {
        // Server logout is best-effort
      }
      set({ ...defaults });
    },

    checkSession: async () => {
      set({ isLoading: true });
      try {
        const { data } = await apiClient.get('/api/auth/session/');
        if (data.isAuthenticated && data.user) {
          set({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          set({ ...defaults });
        }
      } catch {
        set({ ...defaults });
      }
    },
  })
);
