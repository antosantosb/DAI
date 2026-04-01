import { memo } from 'react';
import { STATUS_CONFIG } from './constants';

function BusCard({ bus, isSelected, onClick }) {
  const cfg = STATUS_CONFIG[bus.displayStatus] || STATUS_CONFIG.active;
  const isDeactivated = bus.displayStatus === 'deactivated';

  return (
    <div
      className={`livemap-bus-card livemap-bus-card--${bus.displayStatus}${isSelected ? ' selected' : ''}`}
      onClick={onClick}
    >
      <div className="livemap-bus-card-header">
        <span className="livemap-bus-code">{bus.busId}</span>
        <span className="livemap-bus-badge" style={{ background: `${cfg.color}18`, color: cfg.color }}>
          {cfg.label}
        </span>
      </div>
      <div className="livemap-bus-card-body">
        <div className="livemap-bus-meta">
          <div className="livemap-bus-meta-item">
            <span className="livemap-bus-meta-label">Velocidade</span>
            <span className="livemap-bus-meta-value">{isDeactivated ? 0 : (bus.speed?.toFixed(0) || 0)} km/h</span>
          </div>
          <div className="livemap-bus-meta-item">
            <span className="livemap-bus-meta-label">Passageiros</span>
            <span className="livemap-bus-meta-value">{isDeactivated ? 0 : (bus.passengers ?? 0)}</span>
          </div>
          <div className="livemap-bus-meta-item">
            <span className="livemap-bus-meta-label">Prox. Paragem</span>
            <span className="livemap-bus-meta-value">{isDeactivated ? '—' : (bus.nextStop || '—')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(BusCard);
