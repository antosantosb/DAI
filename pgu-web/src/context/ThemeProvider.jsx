// Sprint 0 (F7): gestor de tema light / dark.
//
// State:
//   theme         — 'light' | 'dark' | 'system' (escolha do user)
//   resolvedTheme — 'light' | 'dark' (real, depois de resolver 'system')
//
// O hook applyTheme aplica `data-theme="dark"` (ou remove) no <html>.
// Quando o user esta em modo 'system', escutamos prefers-color-scheme e
// re-resolvemos automaticamente.
//
// Persistencia: localStorage 'pgu-theme'. Defaults a 'system'.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'pgu-theme';
const VALID_THEMES = ['light', 'dark', 'system'];

function resolveTheme(theme) {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  // system
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function applyTheme(resolved) {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.includes(stored) ? stored : 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(theme));

  // Aplica o tema sempre que muda
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [theme]);

  // Escuta mudancas de prefers-color-scheme apenas em modo 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const resolved = mql.matches ? 'dark' : 'light';
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!VALID_THEMES.includes(next)) return;
    setThemeState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
  }, []);

  // Toggle simples: light <-> dark (sem passar por system)
  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const value = { theme, resolvedTheme, setTheme, toggleTheme };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
