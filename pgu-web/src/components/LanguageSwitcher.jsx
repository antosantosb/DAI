// Sprint 0 (F6): toggle PT / EN no sidebar footer.
//
// A escolha persiste em localStorage (chave 'pgu-locale') via configuracao
// do i18n-browser-languagedetector. A mudanca dispara o re-render de todos
// os componentes que usam useTranslation, sem reload da pagina.

import { useTranslation } from 'react-i18next';
import './LanguageSwitcher.css';

const LANGUAGES = [
  { code: 'pt', label: 'PT' },
  { code: 'en', label: 'EN' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('en') ? 'en' : 'pt';

  const change = (code) => {
    if (code !== current) i18n.changeLanguage(code);
  };

  return (
    <div className="lang-switcher" role="group" aria-label="Language">
      {LANGUAGES.map((lng) => (
        <button
          key={lng.code}
          type="button"
          className={`lang-switcher-btn ${current === lng.code ? 'is-active' : ''}`}
          onClick={() => change(lng.code)}
          aria-pressed={current === lng.code}
          title={lng.code === 'pt' ? 'Português' : 'English'}
        >
          {lng.label}
        </button>
      ))}
    </div>
  );
}
