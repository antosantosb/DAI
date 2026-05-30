/**
 * Ícone de estado de mensagem (Sprint 2 redesign).
 *
 * Substitui os símbolos-como-texto que existiam antes (estados de entrega,
 * um SVG monocromático no estilo Lucide. Herda a cor do contentor via
 * `currentColor`, por isso a cor por estado continua a vir do CSS.
 */

const ICONS = {
  // Enviada: um visto.
  ENVIADA: <path d="M20 6 9 17l-5-5" />,
  // Entregue: visto duplo.
  ENTREGUE: (
    <>
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </>
  ),
  // Lida: visto duplo (diferenciado de ENTREGUE pela cor do contentor).
  LIDA: (
    <>
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </>
  ),
  // Falhou: círculo com x.
  FALHOU: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </>
  ),
  // Cancelada: círculo cortado (ban).
  CANCELADA: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </>
  ),
};

export default function MessageStatusIcon({ estado, size = 14, className = '' }) {
  const paths = ICONS[estado];
  if (!paths) return null;
  return (
    <svg
      className={`msg-status-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ verticalAlign: '-2px', flexShrink: 0 }}
    >
      {paths}
    </svg>
  );
}
