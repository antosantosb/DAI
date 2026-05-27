// Sprint 0 (F6): i18n via react-i18next.
//
// Carrega ambos os locales (pt e en) no bundle inicial — sao pequenos
// (~10KB cada) e evita o flicker de "loading..." na primeira mudanca
// de lingua. Persiste a escolha em localStorage (chave 'pgu-locale').
//
// Para usar:
//   import { useTranslation } from 'react-i18next';
//   const { t } = useTranslation();
//   t('nav.dashboard') // -> "Dashboard" / "Dashboard"
//
// Para mudar lingua programaticamente:
//   import i18n from './i18n';
//   i18n.changeLanguage('en');

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import pt from './locales/pt.json';
import en from './locales/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
    },
    fallbackLng: 'pt',
    supportedLngs: ['pt', 'en'],

    interpolation: {
      // React ja faz escape — desligamos o do i18next.
      escapeValue: false,
    },

    detection: {
      // Prioridade: localStorage primeiro (escolha do user), depois navigator
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'pgu-locale',
      caches: ['localStorage'],
    },

    // Em dev mostra warnings de chaves em falta no console
    debug: import.meta.env.DEV,
  });

export default i18n;
