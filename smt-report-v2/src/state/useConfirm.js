// ============================================
// useConfirm.js — a single confirm-before-destructive-action dialog.
// ============================================
import { useCallback, useState } from 'react';

export function useConfirm() {
  const [state, setState] = useState(null); // { title, message, yesLabel, onYes } | null

  const showConfirm = useCallback((title, message, onYes, yesLabel = 'Confirm') => {
    setState({ title, message, yesLabel, onYes });
  }, []);

  const closeConfirm = useCallback(() => setState(null), []);

  const confirmYes = useCallback(() => {
    state?.onYes?.();
    setState(null);
  }, [state]);

  return { confirmState: state, showConfirm, closeConfirm, confirmYes };
}
