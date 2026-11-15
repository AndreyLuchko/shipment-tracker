import type { LoginInput, PublicUser, RegisterInput } from '@shipment-tracker/shared';
import { create } from 'zustand';

import * as authApi from '@/lib/api/auth';
import { ApiError, setSessionExpiredHandler } from '@/lib/api/client';

/** `idle`: not asked yet. `loading`: `/auth/me` is in flight. Then one of the two settled states. */
export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  /** Settles the session once per page load. Never rejects. */
  bootstrap: () => Promise<void>;
  /** Rejects with what the API client threw; the state is then unchanged. */
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Forgets the session locally. The cookies are the API's to clear. */
  clear: () => void;
}

/**
 * The last `/auth/me` probe, shared by concurrent `bootstrap()` calls (React StrictMode runs effects twice).
 * Only read while the status is `loading`, so a settled one left behind is harmless.
 */
let pendingBootstrap: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'idle',
  user: null,

  bootstrap: () => {
    const { status } = get();
    if (status === 'loading' && pendingBootstrap !== null) return pendingBootstrap;
    if (status !== 'idle') return Promise.resolve();
    if (!authApi.hasSessionHint()) {
      set({ status: 'anonymous', user: null });
      return Promise.resolve();
    }

    set({ status: 'loading' });
    const probe = authApi.fetchCurrentUser().then(
      (user) => {
        // A login, register or clear that happened meanwhile is newer than this answer.
        if (get().status === 'loading') set({ status: 'authenticated', user });
      },
      () => {
        if (get().status === 'loading') set({ status: 'anonymous', user: null });
      },
    );
    pendingBootstrap = probe;
    return probe;
  },

  login: async (input) => {
    const user = await authApi.login(input);
    set({ status: 'authenticated', user });
  },

  register: async (input) => {
    const user = await authApi.register(input);
    set({ status: 'authenticated', user });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch (error) {
      const sessionGone =
        error instanceof ApiError && (error.code === 'UNAUTHORIZED' || error.code === 'CSRF_TOKEN_INVALID');
      if (!sessionGone) throw error;
    }
    get().clear();
  },

  clear: () => set({ status: 'anonymous', user: null }),
}));

setSessionExpiredHandler(() => useAuthStore.getState().clear());
