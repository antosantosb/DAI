// Sprint 2 (redesign): pill de conta dedicada da landing/hub.
// Versão própria (não a SidebarUserMenu do backoffice): pill arredondada,
// avatar circular, e um único item no menu — Sair.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function LandingAccount({ username, role, onLogout }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = (username || '?').charAt(0).toUpperCase();

  return (
    <div className="lacc" ref={ref}>
      <button
        type="button"
        className={`lacc-trigger${open ? ' lacc-trigger--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="lacc-avatar">{initial}</span>
        <span className="lacc-text">
          <span className="lacc-name">{username}</span>
          <span className="lacc-role">{role}</span>
        </span>
        <svg className="lacc-caret" width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="lacc-menu" role="menu">
          <button role="menuitem" className="lacc-logout" onClick={() => { setOpen(false); onLogout?.(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t('auth.logoutTitle')}
          </button>
        </div>
      )}
    </div>
  );
}
