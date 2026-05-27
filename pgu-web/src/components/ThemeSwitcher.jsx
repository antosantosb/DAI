// Sprint 0 (F7): toggle light / dark com icone sol / lua.
//
// Comportamento:
//   - resolvedTheme === 'dark'  -> mostra sol (clicar volta a light)
//   - resolvedTheme === 'light' -> mostra lua (clicar volta a dark)
// Toggle ignora o estado 'system' — passa directamente para light/dark.

import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeProvider';
import './ThemeSwitcher.css';

export default function ThemeSwitcher() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      className="theme-switcher"
      onClick={toggleTheme}
      aria-label={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
      title={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
    >
      {isDark ? (
        /* Sol — significa "click para luz" */
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M4.93 19.07l1.41-1.41" />
          <path d="M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        /* Lua — significa "click para escuro" */
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
