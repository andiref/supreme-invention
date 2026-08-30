import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase/config.js';
import { login as apiLogin } from '../api/client.js';

export function useAppAuth() {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        if (!firebaseUser.emailVerified) {
          await signOut(auth);
          setError('Please verify your email address before signing in.');
          setUser(null);
          setLoading(false);
          return;
        }
        const appUser = await apiLogin();
        setUser(appUser);
        setError('');
      } catch (err) {
        await signOut(auth).catch(() => {});
        setUser(null);
        setError(err.message || 'Account is not authorized.');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError('');
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!credential.user.emailVerified) {
        await signOut(auth);
        throw new Error('Please verify your email address before signing in.');
      }
      const appUser = await apiLogin();
      setUser(appUser);
      return appUser;
    } catch (err) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    const value = email.trim();
    if (!value) throw new Error('Enter your email address first.');
    await sendPasswordResetEmail(auth, value);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
  }, []);

  return { user, login, logout, resetPassword, error, loading };
}
