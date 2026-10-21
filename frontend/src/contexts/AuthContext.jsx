/**
 * ExamProctor.ai — Auth Context
 * Provides authentication state + actions to the entire app.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import db from '../storage/db';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      const token = localStorage.getItem('ep_access_token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        setUser(data.data);
        await db.session.put(data.data);
      } catch {
        localStorage.removeItem('ep_access_token');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (identifier, password) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    const { user: u, access_token } = data.data;
    localStorage.setItem('ep_access_token', access_token);
    setUser(u);
    await db.session.put(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* ignore */ }
    localStorage.removeItem('ep_access_token');
    setUser(null);
    await db.session.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
