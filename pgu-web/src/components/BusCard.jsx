import './BusCard.css';

const STATUS_CONFIG = {
  ACTIVE:   { text: 'Em serviço', cls: 'active',   color: '#10b981' },
  STOPPING: { text: 'A parar',    cls: 'stopping', color: '#f59e0b' },
  STOPPED:  { text: 'Parado',     cls: 'stopped',  color: '#94a3b8' },
};

/**
 * Card minimalista de autocarro — info crucial em hierarquia visual clara.
 * Clica → abre o BusDetailPanel.
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
  const cfg = STATUS_CONFIG[bus.status] || STATUS_CONFIG.STOPPED;

  const handleClick = () => {
    if (selectionMode && onToggleSelect) onToggleSelect(bus.id);
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
      className={`buscard buscard--${cfg.cls}${selected ? ' buscard--selected' : ''}${selectionMode ? ' buscard--selectable' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{ animationDelay: `${animationDelay}s`, '--accent': cfg.color }}
      aria-pressed={selectionMode ? selected : undefined}
    >
      {/* Sprint 1 follow-up: sem tick visual — o card inteiro acende
       * (border + halo primary) quando seleccionado. Mais limpo que um
       * checkbox que choca com o badge de status no canto. */}
      {unreadCount > 0 && (
        <span className="buscard-unread" aria-label={`${unreadCount} mensagens não lidas`}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}

      {/* Header: código e status lado a lado */}
      <div className="buscard-row buscard-row--header">
        <span className="buscard-code">{bus.busCode}</span>
        <span className="buscard-status">
          <span className="buscard-status-dot" />
          {cfg.text}
        </span>
      </div>

      {/* Rota */}
      <div className="buscard-row buscard-row--route">
        {bus.routeCode ? (
          <>
            <span className="buscard-route-badge">{bus.routeCode}</span>
            <span className="buscard-route-name">{bus.routeName || 'Sem nome'}</span>
          </>
        ) : (
          <span className="buscard-route-empty">Sem linha</span>
        )}
      </div>

      {/* Motorista */}
      <div className="buscard-row buscard-row--driver">
        {driver ? (
          <>
            <svg className="buscard-driver-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
            </svg>
            <span className="buscard-driver-name">{driver.name}</span>
          </>
        ) : (
          <>
            <svg className="buscard-driver-icon buscard-driver-icon--warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="buscard-driver-missing">Sem motorista</span>
          </>
        )}
      </div>
    </div>
  );
}
