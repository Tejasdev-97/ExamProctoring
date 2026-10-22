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
        const userData = data.data;

        // Desktop app guard: only student accounts are permitted
        if (typeof window !== 'undefined' && window.electronAPI?.isElectron && userData.role !== 'student') {
          localStorage.removeItem('ep_access_token');
          await db.session.clear();
          setUser(null);
          setLoading(false);
          return;
        }

        setUser(userData);
        await db.session.put(userData);
      } catch (err) {
        const isAuthError = err?.response?.status === 401 || err?.response?.status === 403;
        if (isAuthError) {
          // Token is genuinely invalid or expired on server
          localStorage.removeItem('ep_access_token');
          await db.session.clear();
          setUser(null);
        } else {
          // Network error or offline: recover from cached local session if present
          try {
            const cachedUsers = await db.session.toArray();
            if (cachedUsers && cachedUsers.length > 0) {
              const cached = cachedUsers[0];
              // On desktop, cached user must be a student
              if (typeof window !== 'undefined' && window.electronAPI?.isElectron && cached.role !== 'student') {
                localStorage.removeItem('ep_access_token');
                await db.session.clear();
                setUser(null);
              } else {
                setUser(cached);
              }
            } else {
              // Network error or offline without cached session:
              // Preserve ep_access_token so reconnection or subsequent refresh succeeds
              setUser(null);
            }
          } catch {
            setUser(null);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (identifier, password) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    const { user: u, access_token } = data.data;

    // Desktop app guard: reject non-student accounts immediately
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron && u.role !== 'student') {
      throw new Error(
        'Access restricted: The desktop application is reserved exclusively for Student examinations. Administrators and Professors must sign in via the web portal.'
      );
    }

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
