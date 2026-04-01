import L from 'leaflet';

export const DEFAULT_CENTER = [41.5517605, -8.42299034]; // Braga
export const DEFAULT_ZOOM = 14;

export const WS_URL = import.meta.env.VITE_WS_URL
  ? `${import.meta.env.VITE_WS_URL}/ws-telemetry/websocket`
  : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8081/ws-telemetry/websocket`;

export const STATUS_CONFIG = {
  active:      { color: '#22c55e', label: 'Em Viagem',   ring: 'rgba(34,197,94,0.3)' },
  'at-stop':   { color: '#6366f1', label: 'Em Paragem',  ring: 'rgba(99,102,241,0.3)' },
  stopping:    { color: '#f59e0b', label: 'A Parar',     ring: 'rgba(245,158,11,0.3)' },
  deactivated: { color: '#94a3b8', label: 'Desativado',  ring: 'rgba(148,163,184,0.3)' },
};

export function getBusDisplayStatus(backendStatus, telemetryStatus) {
  if (backendStatus === 'STOPPED') return 'deactivated';
  if (backendStatus === 'STOPPING') return 'stopping';
  if (telemetryStatus === 'stopped') return 'at-stop';
  return 'active';
}

// Cache icons by status to avoid re-creating on every update
const iconCache = {};
export function createBusIcon(displayStatus) {
  if (iconCache[displayStatus]) return iconCache[displayStatus];
  const cfg = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.active;
  const icon = L.divIcon({
    className: 'bus-marker',
    html: `<div class="bus-marker-pin" style="--bus-color:${cfg.color};--bus-ring:${cfg.ring}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4S4 2.5 4 6v10zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM18 11H6V6h12v5z"/></svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
  iconCache[displayStatus] = icon;
  return icon;
}

export function busPopupHtml(bus, displayStatus) {
  const cfg = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.active;
  const isDeactivated = displayStatus === 'deactivated';
  const speed = isDeactivated ? 0 : (bus.speed?.toFixed(0) || 0);
  const passengers = isDeactivated ? 0 : (bus.passengers ?? 0);
  const nextStop = isDeactivated ? '—' : (bus.nextStop || '—');
  const stopsRemaining = isDeactivated ? '—' : (bus.stopsRemaining ?? '—');
  return `
    <div class="bus-popup">
      <div class="bus-popup-header">
        <strong>${bus.busId}</strong>
        <span class="bus-popup-badge" style="background:${cfg.color}">${cfg.label}</span>
      </div>
      <div class="bus-popup-grid">
        <div><span class="bus-popup-label">Velocidade</span><span class="bus-popup-value">${speed} km/h</span></div>
        <div><span class="bus-popup-label">Passageiros</span><span class="bus-popup-value">${passengers}</span></div>
        <div><span class="bus-popup-label">Prox. Paragem</span><span class="bus-popup-value">${nextStop}</span></div>
        <div><span class="bus-popup-label">Restantes</span><span class="bus-popup-value">${stopsRemaining}</span></div>
      </div>
    </div>`;
}
