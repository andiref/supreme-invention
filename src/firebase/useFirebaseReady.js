// ============================================
// useFirebaseReady.js — signs in anonymously (required by the Realtime
// Database security rules) and resolves once a session exists. This is
// separate from the app's own single-owner login (users.js /
// useAppAuth.js) — that one gates the UI; this one just satisfies
// Firebase's own auth requirement for read/write access.
// ============================================
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from './config.js';

export function useFirebaseReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Force a fresh ID token before signaling ready — the original app
        // does the same (see js/firebase-init.js) to avoid a race where
        // Realtime Database rules evaluate a request against a
        // not-yet-valid token right after sign-in.
        user.getIdToken(true).then(() => setReady(true)).catch(() => setReady(true));
      } else {
        signInAnonymously(auth).catch((err) => {
          console.warn('Anonymous auth failed:', err.message);
          setReady(true); // don't block the UI forever on an auth hiccup
        });
      }
    });
    return unsub;
  }, []);

  return ready;
}
