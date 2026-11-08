import { create } from 'zustand';
import { api, ApiClientError, setAuthToken } from '../lib/api';
import { disconnectSocket } from '../lib/socket';
import type { AuthResponse, MeUser } from '../types';
import { useChatStore } from './chat';

type Status = 'idle' | 'loading' | 'ready';

interface AuthState {
  token: string | null;
  user: MeUser | null;
  status: Status;
  error: string | null;
  /** Sign up / reset codes are returned by the API outside production. */
  devCode: string | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    age: number;
    gender: 'woman' | 'man' | 'nonbinary';
    countryCode: string;
    interestedIn: 'women' | 'men' | 'everyone';
    /** Mandatory 18+ confirmation from the sign up checkbox. */
    ageConfirmed: boolean;
  }) => Promise<{ devCode?: string }>;
  refresh: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ devCode?: string }>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<{ devCode?: string; alreadyVerified?: boolean }>;
  setUser: (user: MeUser) => void;
  clearError: () => void;
  logout: () => void;
}

const TOKEN_KEY = 'hobymine.token';
const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;

function persistToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
  setAuthToken(token);
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: storedToken,
  user: null,
  status: storedToken ? 'idle' : 'ready',
  error: null,
  devCode: null,

  bootstrap: async () => {
    const token = get().token;
    if (!token) {
      set({ status: 'ready', user: null });
      return;
    }
    setAuthToken(token);
    set({ status: 'loading' });
    try {
      const { user } = await api.get<{ user: MeUser }>('/api/auth/me');
      set({ token, user, status: 'ready', error: null });
    } catch (error) {
      // Only an authentication failure means the session is over. A network
      // outage (or a server restart) must keep the token: otherwise a few
      // seconds without Wi-Fi would silently sign the user out.
      if (error instanceof ApiClientError && error.status === 401) {
        persistToken(null);
        set({ token: null, user: null, status: 'ready', error: null });
        return;
      }
      const message =
        error instanceof ApiClientError && error.status === 0
          ? error.message
          : 'The server is unavailable right now. Retrying will resume your session.';
      set({ token, user: null, status: 'ready', error: message });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const { token, user } = await api.post<AuthResponse>('/api/auth/login', {
        email: email.trim(),
        password,
      });
      persistToken(token);
      set({ token, user, status: 'ready', error: null });
    } catch (error) {
      set({ error: messageFor(error, 'Invalid email or password') });
      throw error;
    }
  },

  register: async (input) => {
    set({ error: null });
    try {
      const { token, user, devCode } = await api.post<AuthResponse>('/api/auth/register', {
        ...input,
        name: input.name.trim(),
        email: input.email.trim(),
      });
      persistToken(token);
      set({
        token,
        user,
        status: 'ready',
        error: null,
        devCode: devCode ?? null,
      });
      return { devCode: devCode ?? undefined };
    } catch (error) {
      set({ error: messageFor(error, 'Could not create account') });
      throw error;
    }
  },

  refresh: async () => {
    if (!get().token) return;
    try {
      const { user } = await api.get<{ user: MeUser }>('/api/auth/me');
      set({ user });
    } catch (error) {
      // A transient refresh failure should not sign the user out, but an
      // expired session must return them to the sign in screen.
      if (error instanceof ApiClientError && error.status === 401) {
        persistToken(null);
        set({ token: null, user: null, status: 'ready' });
      }
    }
  },

  forgotPassword: async (email: string) => {
    set({ error: null });
    try {
      const { devCode } = await api.post<{ sent: boolean; devCode?: string }>(
        '/api/auth/forgot-password',
        { email: email.trim() },
      );
      return { devCode };
    } catch (error) {
      set({ error: messageFor(error, 'Could not start password reset') });
      throw error;
    }
  },

  resetPassword: async (email: string, code: string, password: string) => {
    set({ error: null });
    try {
      await api.post('/api/auth/reset-password', {
        email: email.trim(),
        code: code.trim(),
        password,
      });
    } catch (error) {
      set({ error: messageFor(error, 'Could not reset password') });
      throw error;
    }
  },

  verifyEmail: async (email: string, code: string) => {
    set({ error: null });
    try {
      const { user } = await api.post<{ user: MeUser }>('/api/auth/verify-email', {
        email: email.trim(),
        code: code.trim(),
      });
      set({ user, devCode: null });
    } catch (error) {
      set({ error: messageFor(error, 'Could not verify email') });
      throw error;
    }
  },

  resendVerification: async (email: string) => {
    set({ error: null });
    try {
      const { devCode, alreadyVerified } = await api.post<{
        sent: boolean;
        devCode?: string;
        alreadyVerified?: boolean;
      }>('/api/auth/resend-verification', { email: email.trim() });
      set({ devCode: devCode ?? null });
      return { devCode, alreadyVerified };
    } catch (error) {
      set({ error: messageFor(error, 'Could not resend verification') });
      throw error;
    }
  },

  setUser: (user) => set({ user }),
  clearError: () => set({ error: null }),

  logout: () => {
    persistToken(null);
    disconnectSocket();
    useChatStore.getState().reset();
    set({ token: null, user: null, status: 'ready', error: null, devCode: null });
  },
}));
