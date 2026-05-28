// Sprint 1 follow-up: input de password com olhinho show/hide.
// Reutilizado em AccountForm, Users modal, DevTools (futuro), etc.
// Aceita as mesmas props que um <input>, com o `type` forçado pelo toggle.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './PasswordInput.css';

export default function PasswordInput({ id, value, onChange, placeholder, required, disabled, autoComplete, minLength, name, className = '' }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);

  return (
    <div className={`pw-input ${className}`}>
      <input
        id={id}
        name={name}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        minLength={minLength}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShown((v) => !v)}
        tabIndex={-1}
        aria-label={shown ? t('common.hidePassword') : t('common.showPassword')}
        title={shown ? t('common.hidePassword') : t('common.showPassword')}
        disabled={disabled}
      >
        {shown ? (
          // eye-off
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          // eye
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  );
}
