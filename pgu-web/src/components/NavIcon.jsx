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
