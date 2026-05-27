/**
 * Ícones SVG para a navegação do backoffice.
 * Stroke uniforme (1.8), viewBox 24, currentColor — para herdar cor do NavLink.
 * Substituem os HTML entities (&#9632; etc.) que violavam a regra `no-emoji-icons`.
 */
const common = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const IconDashboard = () => (
  <svg {...common} aria-hidden="true">
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconAnalytics = () => (
  <svg {...common} aria-hidden="true">
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 3 3 5-6" />
  </svg>
);

export const IconBus = () => (
  <svg {...common} aria-hidden="true">
    <rect x="4" y="4" width="16" height="14" rx="2" />
    <path d="M4 11h16" />
    <circle cx="8" cy="18" r="1.5" />
    <circle cx="16" cy="18" r="1.5" />
    <path d="M7 7h2M15 7h2" />
  </svg>
);

export const IconHealth = () => (
  <svg {...common} aria-hidden="true">
    <path d="M3 12h4l2-5 4 10 2-5h6" />
  </svg>
);

export const IconStop = () => (
  <svg {...common} aria-hidden="true">
    <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

export const IconRoute = () => (
  <svg {...common} aria-hidden="true">
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M6 8.5v3A4.5 4.5 0 0 0 10.5 16h3a4.5 4.5 0 0 1 4.5 4.5V16" />
  </svg>
);

export const IconExport = () => (
  <svg {...common} aria-hidden="true">
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const IconAudit = () => (
  <svg {...common} aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

export const IconUsers = () => (
  <svg {...common} aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

// Sprint 0 (F6 follow-up): icone proprio para Motoristas (id card) para
// distinguir de Utilizadores na sidebar.
export const IconDriver = () => (
  <svg {...common} aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2.5" />
    <circle cx="8.5" cy="11" r="2.6" />
    <path d="M4.5 17.5c.7-1.7 2.3-2.8 4-2.8s3.3 1.1 4 2.8" />
    <line x1="14.5" y1="9.5" x2="19.5" y2="9.5" />
    <line x1="14.5" y1="13" x2="19.5" y2="13" />
    <line x1="14.5" y1="16.5" x2="17.5" y2="16.5" />
  </svg>
);

export const IconGtfs = () => (
  <svg {...common} aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

// Sprint 0 (F4 follow-up): icone para Fontes (data sources). Database cylinder
// para distinguir visualmente do IconGtfs (upload arrow) na sidebar.
export const IconDataSource = () => (
  <svg {...common} aria-hidden="true">
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
  </svg>
);

export const IconAlarm = () => (
  <svg {...common} aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// Sprint 0 (F1): icone para Parametros, substitui o emoji ⚙️ que estava
// no Layout original (em conflito com a regra no-emoji-icons).
export const IconSettings = () => (
  <svg {...common} aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
