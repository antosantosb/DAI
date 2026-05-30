import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthProvider';
import LanguageSwitcher from '../components/LanguageSwitcher';
import TubLogo from '../components/TubLogo';
import LandingAccount from '../components/LandingAccount';
import ProjectDisclaimer from '../components/ProjectDisclaimer';
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

  const roleLabel = roles.includes('admin')
    ? t('auth.roles.admin')
    : roles.includes('developer')
      ? t('auth.roles.developer')
      : roles.includes('motorista')
        ? t('auth.roles.motorista')
        : t('auth.roles.funcionario');

  return (
    <div className="landing">
      <div className="landing-bg">
        <div className="landing-bg-gradient"></div>
        <svg className="landing-routes" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
          <path d="M-40 140 C 180 230, 120 440, 300 520 S 210 820, 440 950" stroke="#009BDB" strokeWidth="2.5" />
          <path d="M1480 200 C 1250 270, 1330 480, 1150 560 S 1270 840, 1050 980" stroke="#E2231A" strokeWidth="2.5" />
          <path d="M240 -40 C 470 140, 900 90, 1200 -10" stroke="#38BDF8" strokeWidth="2" />
          <path d="M-40 760 C 260 700, 560 840, 860 770 S 1240 690, 1480 780" stroke="#009BDB" strokeWidth="2" />
          <circle cx="300" cy="520" r="6" fill="#009BDB" />
          <circle cx="120" cy="430" r="5" fill="#38BDF8" />
          <circle cx="1150" cy="560" r="6" fill="#E2231A" />
          <circle cx="1330" cy="470" r="5" fill="#38BDF8" />
          <circle cx="860" cy="770" r="5" fill="#009BDB" />
        </svg>
      </div>

      <div className="landing-content">
        <div className="landing-header">
          <div className="landing-logo">
            <TubLogo size={44} className="landing-logo-svg" />
          </div>
          <p className="landing-subtitle">{t('landing.subtitle')}</p>
        </div>

        {authenticated && isMotorista ? (
          <div className="landing-login-section">
            <p className="landing-login-text">{t('landing.enteringDriver')}</p>
          </div>
        ) : authenticated ? (
          <>
            <div className="hub-routes">
              <button className="hub-route hub-route--backoffice" onClick={() => navigate('/backoffice')}>
                <span className="hub-route-rail"></span>
                <span className="hub-route-icon">
                  <svg viewBox="0 0 32 32" fill="none">
                    <rect x="4" y="4" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
                    <rect x="7" y="7" width="8" height="5" rx="1" fill="currentColor" opacity="0.2" />
                    <rect x="17" y="7" width="8" height="5" rx="1" fill="currentColor" opacity="0.2" />
                    <rect x="7" y="14" width="18" height="2" rx="1" fill="currentColor" opacity="0.15" />
                    <line x1="12" y1="22" x2="20" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="16" y1="22" x2="16" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="10" y1="26" x2="22" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="hub-route-title">{t('landing.cards.backoffice.title')}</span>
                <svg className="hub-route-arrow" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>

              <button className="hub-route hub-route--livemap" onClick={() => navigate('/livemap')}>
                <span className="hub-route-rail"></span>
                <span className="hub-route-icon">
                  <svg viewBox="0 0 32 32" fill="none">
                    <path d="M6 8L13 5V24L6 27V8Z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M13 5L20 8V27L13 24V5Z" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M20 8L27 5V24L20 27V8Z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <circle cx="22" cy="14" r="3" fill="currentColor" opacity="0.3" />
                    <circle cx="22" cy="14" r="1.2" fill="currentColor" />
                  </svg>
                </span>
                <span className="hub-route-title">{t('landing.cards.livemap.title')}</span>
                <svg className="hub-route-arrow" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>
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

        {authenticated && !isMotorista && (
          <div className="landing-account">
            <LandingAccount username={username} role={roleLabel} onLogout={logout} />
          </div>
        )}

        <div className="landing-lang">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
