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
  // Sprint 1 (F1): pagina publica de Open Data (R.BO.01 / R.IVT.09 / R.INT.10).
  // URL externo divulgavel para dados.gov.pt / QGIS / devs de apps de mobilidade.
  {
    path: '/open-data',
    loader: () => import('./pages/OpenData'),
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
    path: '/driver',
    loader: () => import('./pages/DriverConsole'),
    access: 'authenticated',
    layout: 'none',
  },
  // Sprint 7 (chatbot IA): rota standalone, sem sidebar. UX de chat ocupa
  // o ecra inteiro. A entrada no sidebar e' uma "ghost entry" em
  // /backoffice children com sidebarOnly+to, que aponta aqui.
  {
    path: '/chatbot',
    loader: () => import('./pages/Chatbot'),
    access: ['admin', 'funcionario', 'developer'],
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
    access: ['admin', 'funcionario', 'developer'],
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
      // Sprint 1 follow-up: variante com :id para deep-link a uma ocorrencia
      // (corrige bug #6 — clicar num alerta abria tab em branco porque a
      // rota /backoffice/ocorrencias/15 nao tinha match no router).
      {
        path: 'ocorrencias/:id',
        loader: () => import('./pages/Ocorrencias'),
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
        // Sprint 2 (redesign): editor manual de padrao (sem nav; deep link da aba Linhas).
        path: 'routes/:id/patterns/new',
        loader: () => import('./pages/PatternEditor'),
        access: ['admin', 'developer'],
      },
      {
        // Editar um padrao existente (carrega a sequencia de autoria guardada).
        path: 'routes/:id/patterns/:patternId/edit',
        loader: () => import('./pages/PatternEditor'),
        access: ['admin', 'developer'],
      },
      {
        path: 'stops',
        loader: () => import('./pages/Stops'),
        nav: { sectionKey: 'sections.operations', labelKey: 'nav.stops', iconKey: 'IconStop' },
      },
      // Sprint 1 (F0): Operadores de transporte (R.IVT.03).
      // GET aberto a qualquer autenticado; mutacoes restritas a admin/developer
      // via SecurityConfig.
      {
        path: 'operators',
        loader: () => import('./pages/Operators'),
        access: ['admin', 'developer'],
        nav: { sectionKey: 'sections.operations', labelKey: 'nav.operators', iconKey: 'IconOperator' },
      },
      // Sprint 1 (F4): Calendario operacional (R.IVT.05).
      {
        path: 'calendar',
        loader: () => import('./pages/Calendar'),
        nav: { sectionKey: 'sections.operations', labelKey: 'nav.calendar', iconKey: 'IconCalendar' },
      },
      // Sprint 1 (F4): Horarios planeados (trips do GTFS) (R.IVT.05).
      {
        path: 'schedules',
        loader: () => import('./pages/Schedules'),
        nav: { sectionKey: 'sections.operations', labelKey: 'nav.schedules', iconKey: 'IconSchedule' },
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
        access: ['admin', 'developer'],
        nav: { sectionKey: 'sections.administration', labelKey: 'nav.users', iconKey: 'IconUsers' },
      },
      {
        path: 'drivers',
        loader: () => import('./pages/Drivers'),
        access: ['admin', 'developer'],
        nav: { sectionKey: 'sections.administration', labelKey: 'nav.drivers', iconKey: 'IconDriver' },
      },
      {
        path: 'data-sources',
        loader: () => import('./pages/DataSources'),
        nav: { sectionKey: 'sections.data', labelKey: 'nav.dataSources', iconKey: 'IconDataSource' },
      },
      {
        path: 'gtfs',
        loader: () => import('./pages/GtfsManager'),
        access: ['admin', 'developer'],
        nav: { sectionKey: 'sections.data', labelKey: 'nav.gtfs', iconKey: 'IconGtfs' },
      },
      {
        path: 'audit',
        loader: () => import('./pages/AuditLogs'),
        nav: { sectionKey: 'sections.administration', labelKey: 'nav.audit', iconKey: 'IconAudit' },
      },
      // Chatbot IA (Rúben): assistente conversacional + dashboard de monitorizacao.
      // Sprint 7: o chatbot e' uma rota standalone (/chatbot) para ter chat
      // em ecra inteiro sem sidebar. Esta entrada serve apenas para popular o
      // sidebar. `sidebarOnly: true` faz App.jsx pular a criacao de Route, e
      // `nav.to` redireciona o NavLink para a rota standalone.
      {
        sidebarOnly: true,
        nav: { sectionKey: 'sections.data', labelKey: 'nav.chatbot', iconKey: 'IconChatbot', to: '/chatbot' },
      },
      {
        path: 'ai-monitoring',
        loader: () => import('./pages/AiMonitoring'),
        access: ['admin', 'developer'],
        nav: { sectionKey: 'sections.data', labelKey: 'nav.aiMonitoring', iconKey: 'IconAiMonitoring' },
      },
      {
        path: 'configuracoes',
        loader: () => import('./pages/GlobalConfig'),
        access: ['admin', 'developer'],
        nav: { sectionKey: 'sections.administration', labelKey: 'nav.settings', iconKey: 'IconSettings' },
      },
      // Sprint 1 follow-up: Ferramentas Dev / Demo. Acesso restrito ao role
      // "developer" — botoes que disparam endpoints placeholder no backend
      // (sem efeitos reais; apenas validam wiring de role -> rota -> security).
      {
        // Sprint 1 follow-up: Ferramentas Dev tem section propria no topo
        // do sidebar (mais visivel) — destinada apenas a role developer.
        path: 'dev',
        loader: () => import('./pages/DevTools'),
        access: ['developer'],
        nav: { sectionKey: 'sections.dev', labelKey: 'nav.devTools', iconKey: 'IconDevTools' },
      },
      // ---- PESSOAL (self-service de conta) ----
      // Sprint 1 follow-up: removida a entrada do sidebar — agora abre-se
      // clicando no bloco do user no rodape (sidebar-footer-user). A rota
      // continua acessivel em /backoffice/conta.
      {
        path: 'conta',
        loader: () => import('./pages/MinhaConta'),
        access: ['admin', 'funcionario', 'developer'],
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
