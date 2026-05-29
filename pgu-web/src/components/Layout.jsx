// Sprint 0 (F1): Layout do backoffice. O sidebar e' construido iterando o
// manifest `routes` (em src/routes.js), filtrado pelas roles do user.
//
// Antes: cada NavLink era hardcoded e a filtragem admin-only era um `if`
// isolado. Agora basta editar `routes.js` para adicionar/remover items.

import { useState, useEffect, useMemo, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthProvider';
import {
  IconDashboard, IconAnalytics, IconBus, IconHealth,
  IconStop, IconRoute, IconExport, IconAudit, IconUsers, IconGtfs, IconAlarm,
  IconSettings, IconDataSource, IconDriver, IconAccount,
  IconChatbot, IconAiMonitoring, IconDevTools, IconOperator, IconCalendar, IconSchedule,
} from './NavIcon';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import Avatar from './Avatar';
import TubLogo from './TubLogo';
import ProjectDisclaimer from './ProjectDisclaimer';
import api from '../services/api';
import { getOcorrencias } from '../services/ocorrenciasApi';
import { routes, hasAccess } from '../routes';
import './Layout.css';

// Mapping iconKey (string no manifest) -> componente React.
const ICON_COMPONENTS = {
  IconDashboard,
  IconAnalytics,
  IconBus,
  IconHealth,
  IconStop,
  IconRoute,
  IconExport,
  IconAudit,
  IconUsers,
  IconGtfs,
  IconAlarm,
  IconSettings,
  IconDataSource,
  IconDriver,
  IconAccount,
  IconChatbot,
  IconAiMonitoring,
  IconDevTools,
  IconOperator,
  IconCalendar,
  IconSchedule,
};

// Ordem fixa das sections (chaves i18n, para o sidebar nao reordenar).
// Sprint 1 follow-up: 'sections.dev' fica em primeiro lugar (so' visivel
// para role developer, com items access:['developer']). Destaca as
// ferramentas internas de demo sem as misturar com Administracao.
const SECTION_ORDER = ['sections.dev', 'sections.main', 'sections.operations', 'sections.administration', 'sections.personal'];

/**
 * Constroi a lista de nav items visiveis para um determinado authState.
 * Itera os children de /backoffice do manifest, filtra por nav + acesso, e
 * agrupa por sectionKey.
 */
function buildNavSections(authState) {
  const backoffice = routes.find((r) => r.path === '/backoffice');
  if (!backoffice?.children) return [];

  const parentAccess = backoffice.access;
  const items = backoffice.children
    .filter((c) => c.nav)
    .filter((c) => hasAccess(c.access ?? parentAccess, authState));

  // Agrupar por sectionKey, preservando ordem do SECTION_ORDER
  const grouped = new Map();
  for (const it of items) {
    const sec = it.nav.sectionKey || 'sections.other';
    if (!grouped.has(sec)) grouped.set(sec, []);
    grouped.get(sec).push(it);
  }

  const result = [];
  for (const sectionKey of SECTION_ORDER) {
    if (grouped.has(sectionKey)) {
      result.push({ sectionKey, items: grouped.get(sectionKey) });
      grouped.delete(sectionKey);
    }
  }
  // Sections custom (nao previstas no SECTION_ORDER) vao para o fim
  for (const [sectionKey, items] of grouped.entries()) {
    result.push({ sectionKey, items });
  }
  return result;
}

/**
 * Constroi o `to` correto de um child:
 *  - index    -> /backoffice
 *  - sidebarOnly com nav.to -> path absoluto (ex: /chatbot)
 *  - normal   -> /backoffice/path
 */
function buildLink(child) {
  if (child.nav?.to) return child.nav.to;
  if (child.index) return '/backoffice';
  return `/backoffice/${child.path}`;
}

// Key para persistir o estado collapsed das sections em localStorage.
const COLLAPSED_KEY = 'pgu:sidebar-sections-collapsed';

function loadCollapsedSections() {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function Layout() {
  const auth = useAuth();
  const { logout, username, roles } = auth;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [alarmsCount, setAlarmsCount] = useState(0);
  const [meProfile, setMeProfile] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState(loadCollapsedSections);
  // Sprint 1 follow-up: dropdown menu do utilizador (substitui botoes inline
  // de home/logout). Cliclar no card abre — click-outside ou Escape fecham.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onClick = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setAccountMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountMenuOpen]);

  const toggleSection = (sectionKey) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [sectionKey]: !prev[sectionKey] };
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)); } catch { /* ignora */ }
      return next;
    });
  };

  useEffect(() => {
    const fetchAlarmsCount = async () => {
      try {
        const response = await getOcorrencias({ estado: 'ABERTA' });
        setAlarmsCount(response.data.length);
      } catch (err) {
        console.error('Erro ao buscar quantidade de alarmes ativos:', err);
      }
    };
    fetchAlarmsCount();
    const interval = setInterval(fetchAlarmsCount, 10000);
    return () => clearInterval(interval);
  }, []);

  // Carrega /me 1x para popular o avatar/nome do utilizador no footer.
  useEffect(() => {
    let mounted = true;
    api.get('/me')
      .then(({ data }) => { if (mounted) setMeProfile(data); })
      .catch(() => { /* silencioso — letter avatar funciona como fallback */ });
    return () => { mounted = false; };
  }, []);

  // Sincronizar com upload/remocao de avatar feitos noutras paginas (MinhaConta etc.).
  useEffect(() => {
    const handler = (e) => {
      setMeProfile((prev) => prev ? { ...prev, avatarUrl: e.detail?.avatarUrl ?? null } : prev);
    };
    window.addEventListener('pgu:avatar-updated', handler);
    return () => window.removeEventListener('pgu:avatar-updated', handler);
  }, []);

  // Recalcula nav sections quando authState muda (login/logout)
  const navSections = useMemo(
    () => buildNavSections({ authenticated: true, roles }),
    [roles]
  );

  const isAdmin = roles.includes('admin');
  const isDeveloper = roles.includes('developer');
  const displayRole = isAdmin
    ? t('auth.roles.admin')
    : isDeveloper
      ? t('auth.roles.developer')
      : t('auth.roles.funcionario');
  const fullName = meProfile
    ? [meProfile.firstName, meProfile.lastName].filter(Boolean).join(' ').trim()
    : '';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <TubLogo size={28} className="sidebar-logo-svg" />
            <span className="sidebar-brand-divider" aria-hidden="true" />
            <span className="sidebar-brand-label">Backoffice</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navSections.map(({ sectionKey, items }) => {
            const isCollapsed = !!collapsedSections[sectionKey];
            const safeId = `section-${sectionKey.replace(/\./g, '-')}`;
            return (
              <div
                key={sectionKey}
                className={`sidebar-section${isCollapsed ? ' collapsed' : ''}${sectionKey === 'sections.dev' ? ' sidebar-section--dev' : ''}`}
              >
                <button
                  type="button"
                  className="sidebar-section-label"
                  onClick={() => toggleSection(sectionKey)}
                  aria-expanded={!isCollapsed}
                  aria-controls={safeId}
                >
                  <span>{t(sectionKey)}</span>
                  <svg
                    className="sidebar-section-chevron"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div
                  id={safeId}
                  className="sidebar-section-items"
                  role="region"
                >
                  {items.map((item) => {
                    const Icon = ICON_COMPONENTS[item.nav.iconKey];
                    const to = buildLink(item);
                    const showBadge = item.nav.badge === 'alarms' && alarmsCount > 0;
                    const label = t(item.nav.labelKey);
                    return (
                      <NavLink
                        key={to}
                        to={to}
                        end={!!item.index}
                        aria-label={label}
                        tabIndex={isCollapsed ? -1 : 0}
                      >
                        <span className="nav-icon" aria-hidden="true">
                          {Icon ? <Icon /> : null}
                        </span>
                        {label}
                        {showBadge && <span className="nav-badge">{alarmsCount}</span>}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer" ref={accountMenuRef}>
          <button
            type="button"
            className={`sidebar-footer-user${accountMenuOpen ? ' sidebar-footer-user--open' : ''}`}
            onClick={() => setAccountMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
          >
            <Avatar
              url={meProfile?.avatarUrl}
              name={fullName || username || '?'}
              size="md"
              className="sidebar-avatar"
            />
            <div className="sidebar-footer-info">
              <span className="sidebar-footer-name">{username}</span>
              <span className="sidebar-footer-role">{displayRole}</span>
            </div>
            <svg
              className="sidebar-footer-caret"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {accountMenuOpen && (
            <div className="sidebar-account-menu" role="menu">
              <button
                role="menuitem"
                className="sidebar-account-item"
                onClick={() => { setAccountMenuOpen(false); navigate('/backoffice/conta'); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                </svg>
                {t('nav.account')}
              </button>
              <button
                role="menuitem"
                className="sidebar-account-item"
                onClick={() => { setAccountMenuOpen(false); navigate('/'); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-5h-2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                {t('auth.homeTitle')}
              </button>
              <div className="sidebar-account-divider" role="separator" />
              <button
                role="menuitem"
                className="sidebar-account-item sidebar-account-item--danger"
                onClick={() => { setAccountMenuOpen(false); logout(); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                {t('auth.logoutTitle')}
              </button>
            </div>
          )}
          {/* Sprint 1 follow-up: botoes inline de home/logout substituidos
              pelo dropdown aberto a partir do user card acima. */}
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
      <div className="layout-lang">
        <ThemeSwitcher />
        <LanguageSwitcher />
      </div>
    </div>
  );
}
