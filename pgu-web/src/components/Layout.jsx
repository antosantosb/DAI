// Sprint 0 (F1): Layout do backoffice. O sidebar e' construido iterando o
// manifest `routes` (em src/routes.js), filtrado pelas roles do user.
//
// Antes: cada NavLink era hardcoded e a filtragem admin-only era um `if`
// isolado. Agora basta editar `routes.js` para adicionar/remover items.

import { useState, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthProvider';
import {
  IconDashboard, IconAnalytics, IconBus, IconHealth,
  IconStop, IconRoute, IconExport, IconAudit, IconUsers, IconGtfs, IconAlarm,
  IconSettings, IconDataSource, IconDriver, IconAccount,
  IconChatbot, IconAiMonitoring,
} from './NavIcon';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import Avatar from './Avatar';
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
};

// Ordem fixa das sections (chaves i18n, para o sidebar nao reordenar).
const SECTION_ORDER = ['sections.main', 'sections.operations', 'sections.administration', 'sections.personal'];

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
  const displayRole = isAdmin ? t('auth.roles.admin') : t('auth.roles.funcionario');
  const fullName = meProfile
    ? [meProfile.firstName, meProfile.lastName].filter(Boolean).join(' ').trim()
    : '';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">T</div>
            <div>
              <h2>TUB</h2>
              <small>Backoffice</small>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navSections.map(({ sectionKey, items }) => {
            const isCollapsed = !!collapsedSections[sectionKey];
            const safeId = `section-${sectionKey.replace(/\./g, '-')}`;
            return (
              <div
                key={sectionKey}
                className={`sidebar-section${isCollapsed ? ' collapsed' : ''}`}
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

        <div className="sidebar-footer">
          <div className="sidebar-footer-user">
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
          </div>
          <div className="sidebar-footer-actions">
            <button
              className="sidebar-home"
              onClick={() => navigate('/')}
              title={t('auth.homeTitle')}
              aria-label={t('auth.homeTitle')}
            >
              <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
                <path d="M3 10L10 3L17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 8.5V16C5 16.55 5.45 17 6 17H8.5V12.5H11.5V17H14C14.55 17 15 16.55 15 16V8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              className="sidebar-logout"
              onClick={logout}
              title={t('auth.logoutTitle')}
              aria-label={t('auth.logoutTitle')}
            >
              <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
                <path d="M7 17H4C3.45 17 3 16.55 3 16V4C3 3.45 3.45 3 4 3H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M13 14L17 10L13 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="17" y1="10" x2="7" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
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
