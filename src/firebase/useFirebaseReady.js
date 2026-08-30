import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config.js';

export function useFirebaseReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (!user) { setReady(false); return; }
    user.getIdToken(true).then(() => setReady(true)).catch(() => setReady(false));
  }), []);
  return ready;
}
