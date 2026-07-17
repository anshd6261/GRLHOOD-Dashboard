import { useState, useCallback } from 'react';

/** Dark/light theme toggle — persisted, applied via <html data-theme>. */
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const toggle = useCallback(() => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('grlhood_theme', next); } catch {}
    setTheme(next);
  }, []);
  return { theme, toggle };
}
