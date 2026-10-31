import React, { createContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, getToken, setToken } from '../services/api';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'finance' | 'customer';
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  customerId?: string | null;
  customer?: any;
}

interface AuthContextValue {
  user: AuthUser | null;
  meta: any | null;
  loading: boolean;
  loginWithToken: (token: string, user: AuthUser) => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  meta: null,
  loading: true,
  loginWithToken: () => {},
  refreshUser: async () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [meta, setMeta] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchMeta = useCallback(async () => {
    try {
      const res = await apiRequest('/meta');
      setMeta(res.data);
    } catch (_) {
      // Meta may fail if mustChangePassword is true (403 PASSWORD_CHANGE_REQUIRED)
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiRequest('/auth/me');
      setUser(res.data);
      if (!res.data.mustChangePassword) {
        await fetchMeta();
      }
    } catch (_) {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [fetchMeta]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const loginWithToken = (token: string, loggedInUser: AuthUser) => {
    setToken(token);
    setUser(loggedInUser);
    if (!loggedInUser.mustChangePassword) {
      fetchMeta();
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setMeta(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, meta, loading, loginWithToken, refreshUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
