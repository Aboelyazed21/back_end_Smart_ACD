import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearSessionTokens, getAccessToken, refreshAccessToken, setAccessToken, setCsrfToken } from '../lib/api';
import type { LoginResponse, MeResponse, User } from '../lib/types';

interface AuthContextValue {
  user: User | null;
  me: MeResponse | null;
  status: 'bootstrapping' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  reloadMe: () => Promise<void>;
  hasRole: (...roles: User['role'][]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('bootstrapping');

  const fetchMe = useCallback(async () => {
    const result = await api<MeResponse>('/auth/me');
    setMe(result);
    setStatus('authenticated');
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      if (getAccessToken()) {
        try {
          if (!cancelled) await fetchMe();
          return;
        } catch {
          /* fall through to refresh */
        }
      }
      const refreshed = await refreshAccessToken();
      if (cancelled) return;
      if (!refreshed) {
        setStatus('anonymous');
        setMe(null);
        return;
      }
      try {
        await fetchMe();
      } catch {
        if (!cancelled) {
          setStatus('anonymous');
          setMe(null);
        }
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
        skipRefresh: true,
      });
      setAccessToken(result.accessToken);
      setCsrfToken(result.csrfToken);
      await fetchMe();
      return result.user;
    },
    [fetchMe],
  );

  const logout = useCallback(async () => {
    try {
      if (getAccessToken()) await api('/auth/logout', { method: 'POST', skipRefresh: true });
    } catch {
      /* the local session is cleared regardless */
    } finally {
      clearSessionTokens();
      setMe(null);
      setStatus('anonymous');
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      if (getAccessToken()) await api('/auth/logout-all', { method: 'POST', skipRefresh: true });
    } finally {
      clearSessionTokens();
      setMe(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me?.user ?? null,
      me,
      status,
      login,
      logout,
      logoutAll,
      reloadMe: async () => {
        await fetchMe();
      },
      hasRole: (...roles) => Boolean(me?.user && roles.includes(me.user.role)),
    }),
    [me, status, login, logout, logoutAll, fetchMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook is the public API of this provider module
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
