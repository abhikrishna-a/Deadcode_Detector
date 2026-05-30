import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { User, LoginResponse } from '../api/types';

function isMfaVerified(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.mfa_verified_for_session === true;
  } catch {
    return false;
  }
}

const defaults = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
};

const initial = { ...defaults };

try {
  const raw = localStorage.getItem('auth-storage');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.state?.token && !isMfaVerified(parsed.state.token)) {
      localStorage.removeItem('auth-storage');
    }
  }
} catch {}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setRefreshToken: (token: string | null) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  login: (response: LoginResponse) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        ...defaults,

        setUser: (user) => set({ user }),
        setToken: (token) => set({ token }),
        setRefreshToken: (refreshToken) => set({ refreshToken }),
        setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
        setLoading: (isLoading) => set({ isLoading }),

        login: (response: any) => {
          if (response.pre_auth_token) {
            set({
              token: response.pre_auth_token,
              refreshToken: response.refresh,
              user: response.user,
              // A pre-auth token is only valid for completing MFA, not for app access.
              isAuthenticated: false,
              isLoading: false
            });
          } else {
            set({
              token: response.access,
              refreshToken: response.refresh,
              user: response.user,
              isAuthenticated: true,
              isLoading: false
            });
          }
        },

        logout: () => {
          set({ ...defaults });
          localStorage.removeItem('auth-storage');
        }
      }),
      {
        name: 'auth-storage'
      }
    )
  )
);
