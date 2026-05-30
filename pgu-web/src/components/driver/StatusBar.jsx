import React from 'react';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import './DriverConsole.css';

export default function StatusBar({ busId, online, time, driverName, lineCode, onLogout }) {
  return (
    <div className="driver-header-group">
      <header className="driver-status-bar">
        <div className="driver-status-left">
          {busId && (
            <div className="driver-bus-badge" id="driver-bus-id">
              {busId}
            </div>
          )}
          
          {driverName && (
            <div className="driver-header-badge driver-driver-badge" id="driver-name-badge">
              <span className="badge-label">MOTORISTA</span>
              <span className="badge-value">{driverName}</span>
            </div>
          )}

          {lineCode && (
            <div className="driver-header-badge driver-line-badge" id="driver-line-badge">
              <span className="badge-label">LINHA</span>
              <span className="badge-value">{lineCode}</span>
            </div>
          )}

          <div className={`driver-status-indicator ${online ? 'online' : 'offline'}`} id="driver-connection-status">
            <span className="driver-status-dot"></span>
            {online ? (
              <>
                <Wifi size={18} />
                <span>ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff size={18} />
                <span>OFFLINE</span>
              </>
            )}
          </div>
        </div>

        <div className="driver-status-right">
          <div className="driver-status-time" id="driver-clock">
            {time}
          </div>
          {driverName && (
            <button
              className="driver-logout-btn"
              onClick={onLogout}
              id="driver-logout-btn"
              title="Terminar o turno atual"
            >
              Terminar Turno
            </button>
          )}
        </div>
      </header>

      {!online && (
        <div className="driver-offline-banner" id="driver-offline-alert">
          <AlertTriangle size={20} className="animate-pulse" />
          <span>Ligação ao Centro de Controlo perdida</span>
        </div>
      )}
    </div>
  );
}
