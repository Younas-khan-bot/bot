import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, apiErrorMessage, TOKEN_STORAGE_KEY } from '../api/client';
import { User } from '../types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  token: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const res = await apiClient.get('/auth/me');
    setUser(res.data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
        if (storedToken) {
          setToken(storedToken);
          await refreshUser();
        }
      } catch {
        await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await apiClient.post('/auth/login', { email, password });
        await AsyncStorage.setItem(TOKEN_STORAGE_KEY, res.data.token);
        setToken(res.data.token);
        await refreshUser();
      } catch (err) {
        throw new Error(apiErrorMessage(err, 'Login failed'));
      }
    },
    [refreshUser],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      try {
        const res = await apiClient.post('/auth/register', { email, password, displayName });
        await AsyncStorage.setItem(TOKEN_STORAGE_KEY, res.data.token);
        setToken(res.data.token);
        await refreshUser();
      } catch (err) {
        throw new Error(apiErrorMessage(err, 'Registration failed'));
      }
    },
    [refreshUser],
  );

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout, refreshUser, token }),
    [user, isLoading, login, register, logout, refreshUser, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
