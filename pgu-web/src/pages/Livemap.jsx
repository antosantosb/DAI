import { useEffect, useState, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Client } from '@stomp/stompjs';
import api from '../services/api';
import './Livemap.css';

const DEFAULT_CENTER = [41.5517605, -8.42299034]; // Braga
const DEFAULT_ZOOM = 14;
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8081/ws-telemetry/websocket`;

// Bus states from backend: ACTIVE, STOPPING, STOPPED
// Telemetry states: "active" (moving), "stopped" (at bus stop)
function getBusDisplayStatus(backendStatus, telemetryStatus) {
  if (backendStatus === 'STOPPED') return 'deactivated';    // Stopped by manager
  if (backendStatus === 'STOPPING') return 'stopping';       // Finishing route
  if (telemetryStatus === 'stopped') return 'at-stop';       // At a bus stop
  return 'active';                                            // Moving
}

const STATUS_CONFIG = {
  active:      { color: '#22c55e', label: 'Em Viagem',   ring: 'rgba(34,197,94,0.3)' },
  'at-stop':   { color: '#6366f1', label: 'Em Paragem',  ring: 'rgba(99,102,241,0.3)' },
  stopping:    { color: '#f59e0b', label: 'A Parar',     ring: 'rgba(245,158,11,0.3)' },
  deactivated: { color: '#94a3b8', label: 'Desativado',  ring: 'rgba(148,163,184,0.3)' },
};

function createBusIcon(displayStatus) {
  const cfg = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.active;
  return L.divIcon({
    className: 'bus-marker',
    html: `<div class="bus-marker-pin" style="--bus-color:${cfg.color};--bus-ring:${cfg.ring}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4S4 2.5 4 6v10zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM18 11H6V6h12v5z"/></svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function busPopupHtml(bus, displayStatus) {
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

export default function Livemap() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const layersRef = useRef({ stops: [], routes: [] });
  const busMarkersRef = useRef({});

  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [segments, setSegments] = useState({});
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedBus, setSelectedBus] = useState(null);  // busId of clicked bus in sidebar
  const [buses, setBuses] = useState({});
  const [backendBuses, setBackendBuses] = useState({});  // busCode → {status, routeCode, ...}
  const [wsConnected, setWsConnected] = useState(false);

  // Initialize map
  useEffect(() => {
    if (mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapInstance.current);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Load data
  useEffect(() => {
    api.get('/stops').then(r => setStops(r.data || [])).catch(() => setStops([]));
    api.get('/routes').then(r => {
      const allRoutes = r.data || [];
      setRoutes(allRoutes);
      // Fetch OSRM segments for each route
      allRoutes.forEach(route => {
        api.get(`/route-segments/route/${route.id}`)
          .then(res => {
            const segs = res.data || [];
            if (segs.length > 0) {
              setSegments(prev => ({ ...prev, [route.id]: segs }));
            }
          })
          .catch(() => {});
      });
    }).catch(() => setRoutes([]));
  }, []);

  // Update bus marker on map
  const updateBusMarker = useCallback((telemetry) => {
    const map = mapInstance.current;
    if (!map || !telemetry.latitude || !telemetry.longitude) return;

    const backend = backendBuses[telemetry.busId];
    const displayStatus = getBusDisplayStatus(backend?.status, telemetry.status);
    const popup = busPopupHtml(telemetry, displayStatus);

    const existing = busMarkersRef.current[telemetry.busId];
    if (existing) {
      existing.setLatLng([telemetry.latitude, telemetry.longitude]);
      existing.setIcon(createBusIcon(displayStatus));
      existing.setPopupContent(popup);
    } else {
      const marker = L.marker([telemetry.latitude, telemetry.longitude], {
        icon: createBusIcon(displayStatus),
        zIndexOffset: 1000,
      }).addTo(map);
      marker.bindPopup(popup);
      busMarkersRef.current[telemetry.busId] = marker;
    }
  }, [backendBuses]);

  // Load backend bus states (ACTIVE/STOPPING/STOPPED)
  useEffect(() => {
    const loadBackendBuses = () => {
      api.get('/buses').then(r => {
        const map = {};
        (r.data || []).forEach(b => { map[b.busCode] = b; });
        setBackendBuses(map);
      }).catch(() => {});
    };
    loadBackendBuses();
    const interval = setInterval(loadBackendBuses, 10000); // poll every 10s
    return () => clearInterval(interval);
  }, []);

  // WebSocket connection for real-time telemetry
  useEffect(() => {
    // Load initial bus positions
    api.get('/telemetry/latest').then(r => {
      const data = r.data || [];
      const initial = {};
      data.forEach(t => {
        initial[t.busId] = t;
        updateBusMarker(t);
      });
      setBuses(initial);
    }).catch(() => {});

    // Connect STOMP over native WebSocket
    const client = new Client({
      brokerURL: WS_URL,
      reconnectDelay: 5000,
      onConnect: () => {
        setWsConnected(true);
        client.subscribe('/topic/telemetry', (message) => {
          const telemetry = JSON.parse(message.body);
          setBuses(prev => ({ ...prev, [telemetry.busId]: telemetry }));
          updateBusMarker(telemetry);
        });
      },
      onDisconnect: () => setWsConnected(false),
      onStompError: () => setWsConnected(false),
    });

    client.activate();

    return () => {
      client.deactivate();
      Object.values(busMarkersRef.current).forEach(m => {
        if (mapInstance.current) mapInstance.current.removeLayer(m);
      });
      busMarkersRef.current = {};
    };
  }, [updateBusMarker]);

  // Render markers and polylines
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear previous layers
    layersRef.current.stops.forEach(l => map.removeLayer(l));
    layersRef.current.routes.forEach(l => map.removeLayer(l));
    layersRef.current = { stops: [], routes: [] };

    // Build stop lookup
    const stopMap = {};
    stops.forEach(s => { stopMap[s.id] = s; });

    // Draw routes as polylines
    const routesToDraw = selectedRoute
      ? routes.filter(r => r.id === selectedRoute)
      : routes;

    routesToDraw.forEach(route => {
      const color = route.color || '#6366f1';
      const routeSegments = segments[route.id];

      if (routeSegments && routeSegments.length > 0) {
        // Use OSRM segments for accurate road-following polylines
        const sorted = [...routeSegments].sort((a, b) => a.fromStopOrder - b.fromStopOrder);
        const allPoints = [];
        sorted.forEach(seg => {
          (seg.points || []).forEach(p => allPoints.push([p[0], p[1]]));
        });

        if (allPoints.length >= 2) {
          const polyline = L.polyline(allPoints, { color, weight: 4, opacity: 0.8 }).addTo(map);
          polyline.bindPopup(`<strong>${route.name}</strong><br/><code>${route.code}</code>`);
          layersRef.current.routes.push(polyline);
        }
      } else {
        // Fallback: straight lines between stops
        const orderedStops = (route.stops || [])
          .sort((a, b) => a.stopOrder - b.stopOrder)
          .map(rs => stopMap[rs.stopId])
          .filter(Boolean);

        if (orderedStops.length < 2) return;

        const latlngs = orderedStops.map(s => [s.latitude, s.longitude]);
        const polyline = L.polyline(latlngs, { color, weight: 4, opacity: 0.8 }).addTo(map);
        polyline.bindPopup(`<strong>${route.name}</strong><br/><code>${route.code}</code>`);
        layersRef.current.routes.push(polyline);
      }
    });

    // Draw stop markers
    const stopsToShow = selectedRoute
      ? (() => {
          const route = routes.find(r => r.id === selectedRoute);
          if (!route) return stops;
          const ids = new Set((route.stops || []).map(rs => rs.stopId));
          return stops.filter(s => ids.has(s.id));
        })()
      : stops;

    stopsToShow.forEach(stop => {
      if (stop.latitude == null || stop.longitude == null) return;

      const marker = L.circleMarker([stop.latitude, stop.longitude], {
        radius: 7,
        fillColor: '#6366f1',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9,
      }).addTo(map);

      marker.bindPopup(
        `<strong>${stop.name}</strong><br/>` +
        `<code>${stop.code}</code><br/>` +
        `<span style="font-size:11px;color:#64748b">${stop.latitude.toFixed(6)}, ${stop.longitude.toFixed(6)}</span>`
      );

      layersRef.current.stops.push(marker);
    });

    // Fit bounds if we have stops
    if (stopsToShow.length > 0) {
      const bounds = L.latLngBounds(
        stopsToShow
          .filter(s => s.latitude != null && s.longitude != null)
          .map(s => [s.latitude, s.longitude])
      );
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    }
  }, [stops, routes, segments, selectedRoute]);

  const handleRouteClick = (routeId) => {
    setSelectedRoute(prev => prev === routeId ? null : routeId);
  };

  const busList = Object.values(buses).map(bus => {
    const backend = backendBuses[bus.busId];
    const displayStatus = getBusDisplayStatus(backend?.status, bus.status);
    return { ...bus, displayStatus, backend };
  });

  return (
    <div className="livemap-wrapper">
      <div className="livemap-map" ref={mapRef} />

      <div className="livemap-sidebar">
        <div className="livemap-header">
          <h3>TUB Livemap</h3>
          <span className={`livemap-ws-badge ${wsConnected ? 'connected' : ''}`}>
            <span className="livemap-ws-dot" />
            {wsConnected ? 'Live' : 'Offline'}
          </span>
        </div>

        <div className="livemap-stats">
          <div className="livemap-stat">
            <div className="livemap-stat-value">{busList.length}</div>
            <div className="livemap-stat-label">Autocarros</div>
          </div>
          <div className="livemap-stat">
            <div className="livemap-stat-value">{routes.length}</div>
            <div className="livemap-stat-label">Rotas</div>
          </div>
          <div className="livemap-stat">
            <div className="livemap-stat-value">{stops.length}</div>
            <div className="livemap-stat-label">Paragens</div>
          </div>
          <div className="livemap-stat">
            <div className="livemap-stat-value">
              {busList.reduce((sum, b) => sum + (b.passengers ?? 0), 0)}
            </div>
            <div className="livemap-stat-label">Passageiros</div>
          </div>
        </div>

        {busList.length > 0 && (
          <div className="livemap-section">
            <div className="livemap-section-title">Autocarros</div>
            <div className="livemap-bus-list">
              {busList.map(bus => {
                const cfg = STATUS_CONFIG[bus.displayStatus] || STATUS_CONFIG.active;
                const isDeactivated = bus.displayStatus === 'deactivated';
                const isSelected = selectedBus === bus.busId;
                return (
                  <div
                    key={bus.busId}
                    className={`livemap-bus-card livemap-bus-card--${bus.displayStatus}${isSelected ? ' selected' : ''}`}
                    onClick={() => {
                      // Toggle selection: deselect if already selected
                      if (isSelected) {
                        setSelectedBus(null);
                        setSelectedRoute(null);
                      } else {
                        setSelectedBus(bus.busId);
                        // Find this bus's route and filter the map to show only it
                        const backendBus = backendBuses[bus.busId];
                        if (backendBus?.routeId) {
                          setSelectedRoute(backendBus.routeId);
                        } else {
                          setSelectedRoute(null);
                        }
                        // Center map on bus
                        if (mapInstance.current && bus.latitude && bus.longitude) {
                          mapInstance.current.setView([bus.latitude, bus.longitude], 17);
                          busMarkersRef.current[bus.busId]?.openPopup();
                        }
                      }
                    }}
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
              })}
            </div>
          </div>
        )}

        <div className="livemap-section">
          <div className="livemap-section-title">Rotas</div>
          {routes.length === 0 ? (
            <div className="livemap-empty">Nenhuma rota registada</div>
          ) : (
            <div className="livemap-route-list">
              {routes.map(route => (
                <div
                  key={route.id}
                  className={`livemap-route-item ${selectedRoute === route.id ? 'active' : ''}`}
                  onClick={() => handleRouteClick(route.id)}
                >
                  <div
                    className="livemap-route-color"
                    style={{ background: route.color || '#6366f1' }}
                  />
                  <div className="livemap-route-info">
                    <span className="livemap-route-name">{route.name}</span>
                    <span className="livemap-route-code">{route.code}</span>
                  </div>
                  <span className="livemap-route-stops">
                    {route.stops?.length || 0} paragens
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedRoute && (
          <button
            className="livemap-btn-reset"
            onClick={() => setSelectedRoute(null)}
          >
            Mostrar Todas as Rotas
          </button>
        )}
      </div>
    </div>
  );
}
