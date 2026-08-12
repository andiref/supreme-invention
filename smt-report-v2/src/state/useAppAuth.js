// ============================================
// useAppAuth.js — the app's own single-owner login (separate from
// Firebase's anonymous auth). Persists the session in localStorage for
// SESSION_TTL_MS, same as the original app.
// ============================================
import { useCallback, useState } from 'react';
import { login as apiLogin } from '../api/client.js';

const STORAGE_KEY = 'smt_user';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours, one shift

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    const user = stored._ts ? stored.data : stored; // support legacy (unwrapped) format
    const ts = stored._ts || 0;
    if (stored._ts && Date.now() - ts > SESSION_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return user?.email ? user : null;
  } catch {
    return null;
  }
}

function saveStoredUser(user) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ _ts: Date.now(), data: user }));
  } catch {
    /* localStorage unavailable (e.g. private browsing) — session just won't persist */
  }
}

function clearStoredUser() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
}

export function useAppAuth() {
  const [user, setUser] = useState(() => loadStoredUser());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email) => {
    setLoading(true);
    setError('');
    try {
      const loggedInUser = await apiLogin(email);
      setUser(loggedInUser);
      saveStoredUser(loggedInUser);
      return loggedInUser;
    } catch (err) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    clearStoredUser();
  }, []);

  return { user, login, logout, error, loading };
}
