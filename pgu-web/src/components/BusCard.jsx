import { useTranslation } from 'react-i18next';
import './BusCard.css';

// Cada estado mapeia para uma chave i18n (reutiliza as strings ja existentes
// em pages.buses) e uma cor de acento que pinta o ponto de estado + a barra
// superior do card. Sem labels hardcoded.
const STATUS_CONFIG = {
  ACTIVE:         { key: 'pages.buses.statusActive',           cls: 'active',         color: 'var(--color-success, #10b981)' },
  EM_SERVICO:     { key: 'pages.buses.statusActive',           cls: 'active',         color: 'var(--color-success, #10b981)' },
  STARTING:       { key: 'pages.buses.statusStarting',         cls: 'starting',       color: '#0ea5e9' },
  STOPPING:       { key: 'pages.buses.statusStopping',         cls: 'stopping',       color: 'var(--color-warning, #f59e0b)' },
  STOPPED:        { key: 'pages.buses.statusStopped',          cls: 'stopped',        color: 'var(--color-text-light, #94a3b8)' },
  DECOMMISSIONED: { key: 'pages.buses.decommissionedBadge',    cls: 'decommissioned', color: 'var(--color-danger, #ef4444)' },
};

/**
 * Card minimalista de autocarro — hierarquia visual clara, pouco ruido.
 * Topo: codigo em destaque + estado subtil (ponto + label discreto).
 * Meio: numero da linha em badge + nome truncado a uma linha.
 * Base: motorista em linha secundaria.
 * Clica → abre o BusDetailPanel (ou toggle em modo selecao).
 */
export default function BusCard({
  bus,
  driver,
  unreadCount = 0,
  onClick,
  animationDelay = 0,
  // Sprint 1 follow-up: modo selecao. Quando selectionMode=true, o card
  // mostra checkbox sutil no header e o click no card vira "toggle select"
  // (em vez de abrir o painel lateral). Fora desse modo, comportamento normal.
  selectionMode = false,
  selected = false,
  onToggleSelect,
}) {
  const { t } = useTranslation();
  const cfg = STATUS_CONFIG[bus.status] || STATUS_CONFIG.STOPPED;
  // Descomissionado = terminal. Continua clicavel (abre painel minimo apenas
  // com matricula+capacidade), mas nao entra em modo selecao bulk.
  const isDecommissioned = bus.status === 'DECOMMISSIONED';

  const handleClick = () => {
    if (selectionMode && !isDecommissioned && onToggleSelect) onToggleSelect(bus.id);
    else onClick?.();
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`buscard buscard--${cfg.cls}${selected ? ' buscard--selected' : ''}${selectionMode ? ' buscard--selectable' : ''}${isDecommissioned ? ' buscard--inert' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{ animationDelay: `${animationDelay}s`, '--accent': cfg.color }}
      aria-pressed={selectionMode && !isDecommissioned ? selected : undefined}
    >
      {/* Sprint 1 follow-up: sem tick visual — o card inteiro acende
       * (border + halo primary) quando seleccionado. Mais limpo que um
       * checkbox que choca com o badge de status no canto. */}
      {unreadCount > 0 && (
        <span className="buscard-unread" aria-label={t('pages.buses.unreadAria', { count: unreadCount })}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}

      {/* Header: codigo em destaque + estado subtil */}
      <div className="buscard-row buscard-row--header">
        <span className="buscard-code">{bus.busCode}</span>
        <span className="buscard-status">
          <span className="buscard-status-dot" />
          <span className="buscard-status-label">{t(cfg.key)}</span>
        </span>
      </div>

      {/* Descomissionado: estado terminal — escondemos rota e motorista
          para nao mostrar avisos "No line / No driver" que ja nao se aplicam. */}
      {!isDecommissioned && (
        <>
          {/* Rota: numero em badge + nome secundario truncado a uma linha */}
          <div className="buscard-row buscard-row--route">
            {(bus.routeCode || bus.currentRouteCode) ? (
              <>
                <span className="buscard-route-badge">{bus.routeCode || bus.currentRouteCode}</span>
                <span className="buscard-route-name">{bus.routeName || bus.currentRouteName || t('pages.buses.routeUnnamed')}</span>
              </>
            ) : (
              <span className="buscard-route-empty">{t('pages.buses.noRoute')}</span>
            )}
          </div>

          {/* Motorista: linha secundaria discreta */}
          <div className="buscard-row buscard-row--driver">
            {driver ? (
              <>
                <svg className="buscard-driver-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
                </svg>
                <span className="buscard-driver-name">{driver.name}</span>
              </>
            ) : (
              <>
                <svg className="buscard-driver-icon buscard-driver-icon--warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span className="buscard-driver-missing">{t('pages.buses.noDriver')}</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
