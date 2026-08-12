// ============================================
// useTheme.js — light/dark theme, persisted to localStorage.
// Applies/removes a `light` class on <body>, same hook point the
// original CSS uses (body.light selectors).
// ============================================
import { useCallback, useEffect, useState } from 'react';

function loadStoredTheme() {
  try {
    return localStorage.getItem('smt_theme') === 'light';
  } catch {
    return false;
  }
}

export function useTheme() {
  const [isLight, setIsLight] = useState(() => loadStoredTheme());

  useEffect(() => {
    document.body.classList.toggle('light', isLight);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isLight ? '#f0f2f8' : '#0a0a0f');
    try {
      localStorage.setItem('smt_theme', isLight ? 'light' : 'dark');
    } catch { /* noop */ }
  }, [isLight]);

  const toggleTheme = useCallback(() => setIsLight((v) => !v), []);

  return { isLight, toggleTheme };
}
