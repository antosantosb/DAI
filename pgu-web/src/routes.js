// Sprint 0 (F1): fonte canonica de rotas + nav items.
//
// Cada entrada define:
//   - path                rota react-router
//   - loader              () => import('./pages/X')   para React.lazy
//   - requiredRoles       array de roles permitidas (ou null = qualquer autenticado, "public" para sem auth)
//   - layout              'none' | 'backoffice'
//   - nav (opcional)      {section, label, iconKey}   para o sidebar
//   - children (opcional) sub-rotas de um layout
//
// O App.jsx itera estas entradas para criar <Route>. O Layout.jsx itera as
// children de /backoffice (filtradas pelas roles do user) para gerar o sidebar.

export const routes = [
  {
    path: '/',
    loader: () => import('./pages/Landing'),
    access: 'public',
    layout: 'none',
  },
  {
    path: '/livemap',
    loader: () => import('./pages/Livemap'),
    access: 'authenticated',
    layout: 'none',
  },
  {
    path: '/bordo',
    loader: () => import('./pages/PainelBordo'),
    access: ['motorista'],
    layout: 'none',
  },
  {
    path: '/403',
    loader: () => import('./pages/Forbidden'),
    access: 'public',
    layout: 'none',
  },
  {
    path: '/backoffice',
    layout: 'backoffice',
    access: ['admin', 'operador'],
    children: [
      // ---- PRINCIPAL (cockpit do dia-a-dia) ----
      // Sprint 0 (F6): labelKey/sectionKey resolvidos via i18n no Layout.
      {
        index: true,
        loader: () => import('./pages/Dashboard'),
        nav: { sectionKey: 'sections.main', labelKey: 'nav.dashboard', iconKey: 'IconDashboard' },
      },
      {
        path: 'health',
        loader: () => import('./pages/BusHealthDashboard'),
        nav: { sectionKey: 'sections.main', labelKey: 'nav.health', iconKey: 'IconHealth' },
      },
      {
        path: 'buses',
        loader: () => import('./pages/Buses'),
        nav: { sectionKey: 'sections.main', labelKey: 'nav.buses', iconKey: 'IconBus' },
      },
      {
        path: 'ocorrencias',
        loader: () => import('./pages/Ocorrencias'),
        nav: { sectionKey: 'sections.main', labelKey: 'nav.ocorrencias', iconKey: 'IconAlarm', badge: 'alarms' },
      },
      // ---- OPERAÇÕES (planeamento) ----
      {
        path: 'analytics',
        loader: () => import('./pages/AnalyticsDashboard'),
        nav: { sectionKey: 'sections.operations', labelKey: 'nav.analytics', iconKey: 'IconAnalytics' },
      },
      {
        path: 'routes',
        loader: () => import('./pages/Routes'),
        nav: { sectionKey: 'sections.operations', labelKey: 'nav.routes', iconKey: 'IconRoute' },
      },
      {
        path: 'stops',
        loader: () => import('./pages/Stops'),
        nav: { sectionKey: 'sections.operations', labelKey: 'nav.stops', iconKey: 'IconStop' },
      },
      {
        path: 'exports',
        loader: () => import('./pages/Exports'),
        nav: { sectionKey: 'sections.operations', labelKey: 'nav.exports', iconKey: 'IconExport' },
      },
      // ---- ADMINISTRAÇÃO (pessoas + fontes + config) ----
      {
        path: 'users',
        loader: () => import('./pages/Users'),
        access: ['admin'],
        nav: { sectionKey: 'sections.administration', labelKey: 'nav.users', iconKey: 'IconUsers' },
      },
      {
        path: 'drivers',
        loader: () => import('./pages/Drivers'),
        access: ['admin'],
        nav: { sectionKey: 'sections.administration', labelKey: 'nav.drivers', iconKey: 'IconDriver' },
      },
      {
        path: 'data-sources',
        loader: () => import('./pages/DataSources'),
        nav: { sectionKey: 'sections.administration', labelKey: 'nav.dataSources', iconKey: 'IconDataSource' },
      },
      {
        path: 'gtfs',
        loader: () => import('./pages/GtfsManager'),
        access: ['admin'],
        nav: { sectionKey: 'sections.administration', labelKey: 'nav.gtfs', iconKey: 'IconGtfs' },
      },
      {
        path: 'audit',
        loader: () => import('./pages/AuditLogs'),
        nav: { sectionKey: 'sections.administration', labelKey: 'nav.audit', iconKey: 'IconAudit' },
      },
      {
        path: 'configuracoes',
        loader: () => import('./pages/GlobalConfig'),
        access: ['admin'],
        nav: { sectionKey: 'sections.administration', labelKey: 'nav.settings', iconKey: 'IconSettings' },
      },
    ],
  },
];

/**
 * Devolve true se o user pode aceder a uma rota.
 *
 * @param {string|string[]} access   'public' | 'authenticated' | array de roles
 * @param {object} authState         { authenticated, roles }
 */
export function hasAccess(access, authState) {
  if (access === 'public') return true;
  if (!authState.authenticated) return false;
  if (access === 'authenticated' || access == null) return true;
  // access e' array de roles permitidas: basta ter uma
  return access.some((r) => authState.roles.includes(r));
}
