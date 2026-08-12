// ============================================
// useToast.js — a single transient toast message, auto-dismissed.
// ============================================
import { useCallback, useRef, useState } from 'react';

export function useToast() {
  const [message, setMessage] = useState('');
  const timerRef = useRef(null);

  const showToast = useCallback((msg, durationMs = 2600) => {
    setMessage(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(''), durationMs);
  }, []);

  return { toastMessage: message, showToast };
}
