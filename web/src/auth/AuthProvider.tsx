import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setSessionLostHandler } from '../api/client';
import { authApi } from '../api/endpoints';
import type { CodeChallenge, User } from '../api/types';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  user: User | null;
  signup: (b: { name: string; email: string; password: string }) => Promise<User>;
  /** Checks the password and emails a code. Nothing is signed in until `verifyLogin`. */
  login: (b: { email: string; password: string }) => Promise<CodeChallenge>;
  verifyLogin: (code: string) => Promise<User>;
  resendCode: () => Promise<{ resendInSec: number }>;
  forgotPassword: (email: string) => Promise<CodeChallenge>;
  /** Sets the new password and signs in. */
  resetPassword: (b: { code: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  /** Marks the session as active once the "your desk is ready" moment is over. */
  enter: (u: User) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const signOutLocally = useCallback(() => {
    setUser(null);
    setStatus('signedOut');
    qc.clear(); // nothing from the previous account may linger in the cache
  }, [qc]);

  useEffect(() => {
    setSessionLostHandler(signOutLocally);
    let alive = true;
    authApi
      .me()
      .then((r) => {
        if (!alive) return;
        setUser(r.user);
        setStatus('signedIn');
      })
      .catch(() => alive && setStatus('signedOut'));
    return () => {
      alive = false;
    };
  }, [signOutLocally]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      // Sign-up keeps the auth screen up (it shows "your desk is ready"); `enter` switches to the desk.
      signup: async (b) => (await authApi.signup(b)).user,
      login: (b) => authApi.login(b),
      verifyLogin: async (code) => {
        const u = (await authApi.verifyLogin(code)).user;
        setUser(u);
        setStatus('signedIn');
        return u;
      },
      resendCode: () => authApi.resendCode(),
      forgotPassword: (email) => authApi.forgotPassword(email),
      resetPassword: async (b) => {
        const u = (await authApi.resetPassword(b)).user;
        setUser(u);
        setStatus('signedIn');
        return u;
      },
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          signOutLocally();
        }
      },
      enter: (u) => {
        setUser(u);
        setStatus('signedIn');
      },
    }),
    [status, user, signOutLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
