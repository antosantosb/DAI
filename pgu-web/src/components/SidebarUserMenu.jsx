// Sprint 1 follow-up: widget de utilizador (avatar + nome + role + caret)
// com popover de acoes (Minha Conta, Voltar ao Inicio, Sair). Partilhado
// entre o Layout do backoffice e a sidebar do Livemap para garantir UI
// consistente.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Avatar from './Avatar';
import './SidebarUserMenu.css';

export default function SidebarUserMenu({ avatarUrl, name, username, displayRole, onLogout }) {
  const navigate = useNavigate();
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

  return (
    <div className="sb-user" ref={ref}>
      <button
        type="button"
        className={`sb-user-trigger${open ? ' sb-user-trigger--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar url={avatarUrl} name={name || username || '?'} size="md" className="sb-user-avatar" />
        <div className="sb-user-info">
          <span className="sb-user-name">{username}</span>
          <span className="sb-user-role">{displayRole}</span>
        </div>
        <svg className="sb-user-caret" width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="sb-user-menu" role="menu">
          <button
            role="menuitem"
            className="sb-user-item"
            onClick={() => { setOpen(false); navigate('/backoffice/conta'); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
            </svg>
            {t('nav.account')}
          </button>
          <button
            role="menuitem"
            className="sb-user-item"
            onClick={() => { setOpen(false); navigate('/'); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-5h-2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            {t('auth.homeTitle')}
          </button>
          <div className="sb-user-divider" role="separator" />
          <button
            role="menuitem"
            className="sb-user-item sb-user-item--danger"
            onClick={() => { setOpen(false); onLogout?.(); }}
          >
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
