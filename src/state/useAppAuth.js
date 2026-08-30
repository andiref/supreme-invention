import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase/config.js';
import { login as apiLogin } from '../api/client.js';

/** Sends a verification email, swallowing the "already sent recently" rate-limit error so the caller's message stays the same either way. */
async function trySendVerification(firebaseUser) {
  try {
    await sendEmailVerification(firebaseUser);
    return true;
  } catch {
    return false; // most likely rate-limited from a previous attempt — not fatal, they already have one in their inbox
  }
}

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
          const sent = await trySendVerification(firebaseUser);
          await signOut(auth);
          setError(sent ? 'Check your inbox — we just sent a verification link. Click it, then sign in again.' : 'Please verify your email address before signing in (check your inbox for the link).');
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
        const sent = await trySendVerification(credential.user);
        await signOut(auth);
        throw new Error(sent ? 'Check your inbox — we just sent a verification link. Click it, then sign in again.' : 'Please verify your email address before signing in (check your inbox for the link).');
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
