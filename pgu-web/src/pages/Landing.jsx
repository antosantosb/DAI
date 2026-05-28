import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthProvider';
import LanguageSwitcher from '../components/LanguageSwitcher';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { authenticated, login, logout, username, roles } = useAuth();

  // Motorista nunca tem opção de escolher — vai direto para o painel de bordo.
  useEffect(() => {
    if (authenticated && roles.includes('motorista')) {
      navigate('/bordo', { replace: true });
    }
  }, [authenticated, roles, navigate]);

  const isMotorista = roles.includes('motorista');

  return (
    <div className="landing">
      <div className="landing-bg">
        <div className="landing-bg-gradient"></div>
      </div>

      <div className="landing-content">
        <div className="landing-header">
          <div className="landing-logo">
            <svg viewBox="0 0 80 44" fill="none" className="landing-logo-svg">
              <path d="M10 12 C10 9 12 7 15 7 L60 7 C64 7 67 8 68 11 L70 16 L70 33 C70 34.5 69 35.5 67.5 35.5 L12.5 35.5 C11 35.5 10 34.5 10 33 Z" fill="white" opacity="0.9" />
              <rect x="12" y="7" width="53" height="2.5" rx="1.2" fill="white" opacity="0.3" />
              <rect x="15" y="13" width="9" height="9" rx="2" fill="rgba(99,102,241,0.6)" />
              <rect x="27" y="13" width="9" height="9" rx="2" fill="rgba(99,102,241,0.6)" />
              <rect x="39" y="13" width="9" height="9" rx="2" fill="rgba(99,102,241,0.6)" />
              <path d="M52 13 L56 13 C58 13 60 14 60.5 15.5 L62 22 L52 22 Z" fill="rgba(99,102,241,0.4)" />
              <rect x="10" y="24" width="60" height="1.5" rx="0.5" fill="white" opacity="0.2" />
              <circle cx="22" cy="34" r="5" fill="#1e293b" />
              <circle cx="22" cy="34" r="2" fill="#64748b" />
              <circle cx="58" cy="34" r="5" fill="#1e293b" />
              <circle cx="58" cy="34" r="2" fill="#64748b" />
            </svg>
          </div>
          <h1 className="landing-title">{t('landing.title')}</h1>
          <p className="landing-subtitle">{t('landing.subtitle')}</p>
        </div>

        {authenticated && isMotorista ? (
          <div className="landing-login-section">
            <p className="landing-login-text">{t('landing.enteringDriver')}</p>
          </div>
        ) : authenticated ? (
          <>
            <div className="landing-user-info">
              <span className="landing-user-greeting">
                {t('landing.welcome')}<strong>{username}</strong>
              </span>
              <span className="landing-user-role">
                {roles.includes('admin')
                  ? t('auth.roles.admin')
                  : roles.includes('developer')
                    ? t('auth.roles.developer')
                    : roles.includes('motorista')
                      ? t('auth.roles.motorista')
                      : t('auth.roles.funcionario')}
              </span>
            </div>

            <div className="landing-cards">
              <div className="landing-card landing-card--backoffice" onClick={() => navigate('/backoffice')}>
                <div className="landing-card-icon">
                  <svg viewBox="0 0 32 32" fill="none">
                    <rect x="4" y="4" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
                    <rect x="7" y="7" width="8" height="5" rx="1" fill="currentColor" opacity="0.2" />
                    <rect x="17" y="7" width="8" height="5" rx="1" fill="currentColor" opacity="0.2" />
                    <rect x="7" y="14" width="18" height="2" rx="1" fill="currentColor" opacity="0.15" />
                    <line x1="12" y1="22" x2="20" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="16" y1="22" x2="16" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="10" y1="26" x2="22" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <h2>{t('landing.cards.backoffice.title')}</h2>
                <p>{t('landing.cards.backoffice.desc')}</p>
              </div>

              <div className="landing-card landing-card--livemap" onClick={() => navigate('/livemap')}>
                <div className="landing-card-icon">
                  <svg viewBox="0 0 32 32" fill="none">
                    <path d="M6 8L13 5V24L6 27V8Z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M13 5L20 8V27L13 24V5Z" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M20 8L27 5V24L20 27V8Z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <circle cx="22" cy="14" r="3" fill="currentColor" opacity="0.3" />
                    <circle cx="22" cy="14" r="1.2" fill="currentColor" />
                  </svg>
                </div>
                <h2>{t('landing.cards.livemap.title')}</h2>
                <p>{t('landing.cards.livemap.desc')}</p>
              </div>
            </div>

            <button className="landing-logout" onClick={logout}>
              {t('landing.logoutButton')}
            </button>
          </>
        ) : (
          <div className="landing-login-section">
            <p className="landing-login-text">
              {t('landing.intro')}
            </p>
            <button className="landing-login-btn" onClick={login}>
              {t('landing.loginButton')}
            </button>
          </div>
        )}

        <p className="landing-footer-text">{t('landing.footer')}</p>

        <div className="landing-lang">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
