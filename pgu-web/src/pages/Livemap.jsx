import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { Client } from '@stomp/stompjs';
import api from '../services/api';
import {
  DEFAULT_CENTER, DEFAULT_ZOOM, WS_URL,
  getBusDisplayStatus, createBusIcon, busPopupHtml,
} from '../components/livemap/constants';
import BusesTab from '../components/livemap/BusesTab';
import RoutesTab from '../components/livemap/RoutesTab';
import AccountTab from '../components/livemap/AccountTab';
import './Livemap.css';

export default function Livemap() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const stopLayerGroup = useRef(null);
  const routeLayerGroup = useRef(null);
  const busMarkersRef = useRef({});
  const busStatusRef = useRef({});
  const followingBusRef = useRef(null);
  const hasInitialFit = useRef(false);
  const prevSelectedRouteRef = useRef(null);
  const prevRouteBeforeBusRef = useRef(null);
  const backendBusesRef = useRef({});
  const selectedRouteRef = useRef(null);

  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [segments, setSegments] = useState({});
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedBus, setSelectedBus] = useState(null);
  const [buses, setBuses] = useState({});
  const [backendBuses, setBackendBuses] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('buses');
  const [busSearch, setBusSearch] = useState('');
  const [busSort, setBusSort] = useState('route');
  const [routeSearch, setRouteSearch] = useState('');
  const [routeSort, setRouteSort] = useState('name');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showCongestion, setShowCongestion] = useState(false);
  const heatLayerRef = useRef(null);
  const congestionLayerRef = useRef(null);

  // ─── Map initialization ───
  useEffect(() => {
    if (mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      preferCanvas: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapInstance.current);

    stopLayerGroup.current = L.layerGroup().addTo(mapInstance.current);
    routeLayerGroup.current = L.layerGroup().addTo(mapInstance.current);

    mapInstance.current.on('dragstart', () => { followingBusRef.current = null; });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // ─── Load stops + routes + segments ───
  useEffect(() => {
    api.get('/stops').then(r => setStops(r.data || [])).catch(() => setStops([]));
    api.get('/routes').then(r => setRoutes(r.data || [])).catch(() => setRoutes([]));
    api.get('/route-segments').then(r => {
      const allSegments = {};
      (r.data || []).forEach(seg => {
        if (!allSegments[seg.routeId]) allSegments[seg.routeId] = [];
        allSegments[seg.routeId].push(seg);
      });
      setSegments(allSegments);
    }).catch(() => setSegments({}));
  }, []);

  // ─── Update / create bus marker on map ───
  const updateBusMarker = useCallback((telemetry) => {
    const map = mapInstance.current;
    if (!map || !telemetry.latitude || !telemetry.longitude) return;

    const backend = backendBusesRef.current[telemetry.busId];
    // Autocarros parados ou sem registo no backend não aparecem no mapa
    if (backend?.status === 'STOPPED' || (Object.keys(backendBusesRef.current).length > 0 && !backend)) {
      const existing = busMarkersRef.current[telemetry.busId];
      if (existing) {
        mapInstance.current.removeLayer(existing);
        delete busMarkersRef.current[telemetry.busId];
      }
      return;
    }
    const displayStatus = getBusDisplayStatus(backend?.status, telemetry.status);
    const popup = busPopupHtml(telemetry, displayStatus);
    const newLatLng = L.latLng(telemetry.latitude, telemetry.longitude);

    const existing = busMarkersRef.current[telemetry.busId];
    if (existing) {
      // Smooth slide to new position instead of jumping
      const oldLatLng = existing.getLatLng();
      const dist = oldLatLng.distanceTo(newLatLng);
      // Only animate if distance is reasonable (< 2km, avoids teleport glitches)
      if (dist > 1 && dist < 2000) {
        animateMarker(existing, oldLatLng, newLatLng, 800);
      } else {
        existing.setLatLng(newLatLng);
      }

      if (busStatusRef.current[telemetry.busId] !== displayStatus) {
        existing.setIcon(createBusIcon(displayStatus));
        busStatusRef.current[telemetry.busId] = displayStatus;
      }
      existing.setPopupContent(popup);
    } else {
      const marker = L.marker(newLatLng, {
        icon: createBusIcon(displayStatus),
        zIndexOffset: 1000,
      });
      // Só adicionar ao mapa se passar nos filtros ativos (bus focus ou route filter)
      const focusedBus = followingBusRef.current;
      const filteredRoute = selectedRouteRef.current;
      const busRoute = backendBusesRef.current[telemetry.busId]?.routeId;
      const shouldShow = focusedBus
        ? focusedBus === telemetry.busId
        : !filteredRoute || busRoute === filteredRoute;
      if (shouldShow) {
        marker.addTo(map);
      }
      marker.bindPopup(popup);
      busMarkersRef.current[telemetry.busId] = marker;
      busStatusRef.current[telemetry.busId] = displayStatus;
    }

    if (followingBusRef.current === telemetry.busId) {
      map.setView(newLatLng, map.getZoom(), { animate: true, duration: 0.8 });
    }
  }, []);

  // ─── Load backend bus states ───
  useEffect(() => {
    const loadBackendBuses = () => {
      api.get('/buses').then(r => {
        const map = {};
        (r.data || []).forEach(b => { map[b.busCode] = b; });
        backendBusesRef.current = map;
        setBackendBuses(map);
      }).catch(() => {});
    };
    loadBackendBuses();
    const interval = setInterval(loadBackendBuses, 10000);
    return () => clearInterval(interval);
  }, []);

  // ─── Remove markers of STOPPED or deleted buses whenever backend state updates ───
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !Object.keys(backendBuses).length) return;
    Object.entries(busMarkersRef.current).forEach(([busId, marker]) => {
      const backend = backendBuses[busId];
      // Remove se: parado, ou não existe no backend (descomissionado/eliminado)
      if (!backend || backend.status === 'STOPPED') {
        if (map.hasLayer(marker)) map.removeLayer(marker);
        delete busMarkersRef.current[busId];
        delete busStatusRef.current[busId];
      }
    });
    setBuses(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(busId => {
        const backend = backendBuses[busId];
        if (!backend || backend.status === 'STOPPED') delete next[busId];
      });
      return next;
    });
  }, [backendBuses]);

  // ─── WebSocket connection ───
  useEffect(() => {
    api.get('/telemetry/latest').then(r => {
      const data = r.data || [];
      const initial = {};
      data.forEach(t => {
        initial[t.busId] = t;
        updateBusMarker(t);
      });
      setBuses(initial);
    }).catch(() => {});

    const client = new Client({
      brokerURL: WS_URL,
      reconnectDelay: 5000,
      onConnect: () => {
        setWsConnected(true);
        client.subscribe('/topic/telemetry', (message) => {
          const telemetry = JSON.parse(message.body);
          // Ignorar telemetria de autocarros parados ou sem registo
          const b = backendBusesRef.current[telemetry.busId];
          if (b?.status === 'STOPPED' || (Object.keys(backendBusesRef.current).length > 0 && !b)) return;
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

  // ─── Heatmap layer toggle ───
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (!showHeatmap) {
      // Restaurar camadas normais
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      if (stopLayerGroup.current && !map.hasLayer(stopLayerGroup.current)) {
        map.addLayer(stopLayerGroup.current);
      }
      if (routeLayerGroup.current && !map.hasLayer(routeLayerGroup.current)) {
        map.addLayer(routeLayerGroup.current);
      }
      Object.values(busMarkersRef.current).forEach(m => {
        if (!map.hasLayer(m)) map.addLayer(m);
      });
      return;
    }

    // Esconder tudo para o heatmap ficar limpo
    if (stopLayerGroup.current && map.hasLayer(stopLayerGroup.current)) {
      map.removeLayer(stopLayerGroup.current);
    }
    if (routeLayerGroup.current && map.hasLayer(routeLayerGroup.current)) {
      map.removeLayer(routeLayerGroup.current);
    }
    Object.values(busMarkersRef.current).forEach(m => {
      if (map.hasLayer(m)) map.removeLayer(m);
    });

    const abort = new AbortController();
    const fetchHeatmap = async () => {
      try {
        const res = await api.get('/analytics/heatmap', { signal: abort.signal });
        const raw = res.data || [];
        const maxPax = raw.reduce((m, p) => Math.max(m, p.passengerCount || 0), 0) || 1;
        const points = raw.map(p => [p.lat, p.lng, p.passengerCount / maxPax]);

        if (heatLayerRef.current) {
          map.removeLayer(heatLayerRef.current);
          heatLayerRef.current = null;
        }

        if (points.length > 0) {
          heatLayerRef.current = L.heatLayer(points, {
            radius: 22,
            blur: 18,
            maxZoom: 16,
            max: 1.0,
            minOpacity: 0.35,
            gradient: {
              0.2: '#6366f1',
              0.5: '#10b981',
              0.75: '#f59e0b',
              1.0: '#ef4444',
            },
          }).addTo(map);
        }
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          console.error('Error fetching heatmap', err);
        }
      }
    };

    fetchHeatmap();
    const iv = setInterval(fetchHeatmap, 60_000);
    return () => {
      abort.abort();
      clearInterval(iv);
      if (heatLayerRef.current && map) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [showHeatmap]);

  // ─── Congestion layer toggle ───
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (!showCongestion) {
      if (congestionLayerRef.current) {
        map.removeLayer(congestionLayerRef.current);
        congestionLayerRef.current = null;
      }
      return;
    }

    const abort = new AbortController();
    const fetchCongestion = async () => {
      try {
        const res = await api.get('/analytics/congestion', { signal: abort.signal });
        const raw = res.data || [];

        if (congestionLayerRef.current) {
          map.removeLayer(congestionLayerRef.current);
          congestionLayerRef.current = null;
        }

        if (raw.length > 0) {
          const group = L.layerGroup();
          raw.forEach(c => {
            if (!c.lat || !c.lng) return;
            const circle = L.circleMarker([c.lat, c.lng], {
              radius: 10,
              fillColor: '#ef4444',
              color: '#fff',
              weight: 2,
              fillOpacity: 0.7,
              className: 'congestion-pulse',
            });
            circle.bindPopup(
              `<div style="font-size:13px">
                <strong>${c.busId}</strong>${c.routeCode ? ` · <span style="color:#6366f1">${c.routeCode}</span>` : ''}<br/>
                <span style="color:#ef4444;font-weight:600">${(c.speedKmh || 0).toFixed(1)} km/h</span> · ${c.passengerCount} pax<br/>
                <span style="color:#94a3b8">${c.recordedAt}</span>
              </div>`
            );
            group.addLayer(circle);
          });
          congestionLayerRef.current = group;
          group.addTo(map);
        }
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          console.error('Error fetching congestion', err);
        }
      }
    };

    fetchCongestion();
    const iv = setInterval(fetchCongestion, 60_000);
    return () => {
      abort.abort();
      clearInterval(iv);
      if (congestionLayerRef.current && map) {
        map.removeLayer(congestionLayerRef.current);
        congestionLayerRef.current = null;
      }
    };
  }, [showCongestion]);

  // ─── Pre-compute map data ───
  const stopMap = useMemo(() => {
    const map = {};
    stops.forEach(s => { map[s.id] = s; });
    return map;
  }, [stops]);

  const routePolylineData = useMemo(() => {
    return routes.map(route => {
      const color = route.color || '#6366f1';
      const routeSegments = segments[route.id];
      let latlngs = null;

      if (routeSegments && routeSegments.length > 0) {
        const sorted = [...routeSegments].sort((a, b) => a.fromStopOrder - b.fromStopOrder);
        const allPoints = [];
        sorted.forEach(seg => {
          (seg.points || []).forEach(p => allPoints.push([p[0], p[1]]));
        });
        if (allPoints.length >= 2) latlngs = allPoints;
      }

      if (!latlngs) {
        const orderedStops = (route.stops || [])
          .sort((a, b) => a.stopOrder - b.stopOrder)
          .map(rs => stopMap[rs.stopId])
          .filter(Boolean);
        if (orderedStops.length >= 2) {
          latlngs = orderedStops.map(s => [s.latitude, s.longitude]);
        }
      }

      return { id: route.id, name: route.name, code: route.code, color, latlngs };
    }).filter(r => r.latlngs);
  }, [routes, segments, stopMap]);

  // ─── Render map layers (stops + routes) ───
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !stopLayerGroup.current || !routeLayerGroup.current) return;

    stopLayerGroup.current.clearLayers();
    routeLayerGroup.current.clearLayers();

    // Draw routes
    const routesToDraw = selectedRoute
      ? routePolylineData.filter(r => r.id === selectedRoute)
      : routePolylineData;

    routesToDraw.forEach(({ name, code, color, latlngs }) => {
      const polyline = L.polyline(latlngs, { color, weight: 4, opacity: 0.8 });
      polyline.bindPopup(`<strong>${name}</strong><br/><code>${code}</code>`);
      routeLayerGroup.current.addLayer(polyline);
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
        radius: 7, fillColor: '#6366f1', color: '#fff', weight: 2, fillOpacity: 0.9,
      });
      const popupContent = buildPanelLoading(stop);
      marker.bindPopup(popupContent, { minWidth: 260, maxWidth: 300, className: 'stop-panel-popup' });
      marker.on('popupopen', () => {
        api.get(`/stops/${stop.id}/panel`).then(r => {
          const panel = r.data;
          marker.setPopupContent(buildPanelHtml(panel));
        }).catch(() => {
          marker.setPopupContent(buildPanelError(stop));
        });
      });
      stopLayerGroup.current.addLayer(marker);
    });

    // Fit bounds — não fazer quando há um autocarro selecionado (o zoom é controlado pelo handleBusClick)
    const routeChanged = prevSelectedRouteRef.current !== selectedRoute;
    if (!followingBusRef.current && stopsToShow.length > 0 && (!hasInitialFit.current || routeChanged)) {
      hasInitialFit.current = true;
      prevSelectedRouteRef.current = selectedRoute;
      const bounds = L.latLngBounds(
        stopsToShow
          .filter(s => s.latitude != null && s.longitude != null)
          .map(s => [s.latitude, s.longitude])
      );
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    }
  }, [stops, routes, routePolylineData, selectedRoute]);

  // ─── Sidebar handlers ───
  const handleRouteClick = useCallback((routeId) => {
    const map = mapInstance.current;
    if (selectedBus) {
      setSelectedBus(null);
      followingBusRef.current = null;
      prevRouteBeforeBusRef.current = null;
    }

    const newRoute = routeId === null ? null : (selectedRoute === routeId ? null : routeId);
    selectedRouteRef.current = newRoute;
    setSelectedRoute(newRoute);

    // Mostrar/esconder markers conforme a rota selecionada
    if (map) {
      Object.entries(busMarkersRef.current).forEach(([busId, m]) => {
        if (!newRoute) {
          // Sem filtro — mostrar todos
          if (!map.hasLayer(m)) map.addLayer(m);
        } else {
          // Só mostrar autocarros desta rota
          const busRoute = backendBusesRef.current[busId]?.routeId;
          if (busRoute === newRoute) {
            if (!map.hasLayer(m)) map.addLayer(m);
          } else {
            if (map.hasLayer(m)) map.removeLayer(m);
          }
        }
      });
    }
  }, [selectedBus, selectedRoute]);

  const handleBusClick = useCallback((bus) => {
    const map = mapInstance.current;
    const isSelected = selectedBus === bus.busId;
    if (isSelected) {
      // Deselecionar — restaurar visibilidade conforme a rota anterior
      setSelectedBus(null);
      const prevRoute = prevRouteBeforeBusRef.current;
      setSelectedRoute(prevRoute);
      selectedRouteRef.current = prevRoute;
      followingBusRef.current = null;
      prevRouteBeforeBusRef.current = null;
      if (map) {
        Object.entries(busMarkersRef.current).forEach(([busId, m]) => {
          if (!prevRoute) {
            if (!map.hasLayer(m)) map.addLayer(m);
          } else {
            const busRoute = backendBusesRef.current[busId]?.routeId;
            if (busRoute === prevRoute) {
              if (!map.hasLayer(m)) map.addLayer(m);
            } else {
              if (map.hasLayer(m)) map.removeLayer(m);
            }
          }
        });
      }
    } else {
      if (!selectedBus) {
        prevRouteBeforeBusRef.current = selectedRoute;
      }
      setSelectedBus(bus.busId);
      followingBusRef.current = bus.busId;
      const backendBus = backendBuses[bus.busId];
      if (backendBus?.routeId) {
        setSelectedRoute(backendBus.routeId);
        selectedRouteRef.current = backendBus.routeId;
      } else {
        setSelectedRoute(null);
        selectedRouteRef.current = null;
      }
      // Esconder todos os markers excepto o selecionado, e garantir que o selecionado está visível
      if (map) {
        Object.entries(busMarkersRef.current).forEach(([id, m]) => {
          if (id === bus.busId) {
            if (!map.hasLayer(m)) map.addLayer(m);
          } else {
            if (map.hasLayer(m)) map.removeLayer(m);
          }
        });
      }
      // Zoom máximo e centrar no autocarro (defer para correr após os efeitos do React)
      if (map && bus.latitude && bus.longitude) {
        const lat = bus.latitude, lng = bus.longitude, busId = bus.busId;
        setTimeout(() => {
          map.setView([lat, lng], 19, { animate: true });
          busMarkersRef.current[busId]?.openPopup();
        }, 0);
      }
    }
  }, [selectedBus, selectedRoute, backendBuses]);

  return (
    <div className="livemap-wrapper">
      <div className="livemap-map-wrap">
        <div className="livemap-map" ref={mapRef} />
        <div className="livemap-overlay-controls">
          <button
            className={`livemap-overlay-btn${showHeatmap ? ' livemap-overlay-btn--active' : ''}`}
            onClick={() => { setShowHeatmap(h => !h); if (!showHeatmap) setShowCongestion(false); }}
            title={showHeatmap ? 'Desativar heatmap' : 'Heatmap de passageiros'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2c-4 4-8 7.5-8 12a8 8 0 0 0 16 0c0-4.5-4-8-8-12z" />
            </svg>
            Heatmap
          </button>
          <button
            className={`livemap-overlay-btn livemap-overlay-btn--danger${showCongestion ? ' livemap-overlay-btn--active' : ''}`}
            onClick={() => setShowCongestion(c => !c)}
            title={showCongestion ? 'Desativar congestionamento' : 'Pontos de congestionamento'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Trânsito
          </button>
        </div>
      </div>

      <div className="livemap-sidebar">
        <div className="livemap-header">
          <h3>TUB Livemap</h3>
          <span className={`livemap-ws-badge ${wsConnected ? 'connected' : ''}`}>
            <span className="livemap-ws-dot" />
            {wsConnected ? 'Live' : 'Offline'}
          </span>
        </div>

        <div className="livemap-tabs">
          <button className={`livemap-tab ${activeTab === 'buses' ? 'active' : ''}`} onClick={() => setActiveTab('buses')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4S4 2.5 4 6v10zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM18 11H6V6h12v5z"/></svg>
            Autocarros
          </button>
          <button className={`livemap-tab ${activeTab === 'routes' ? 'active' : ''}`} onClick={() => setActiveTab('routes')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11 17h2v-4h4v-2h-4V7h-2v4H7v2h4v4zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
            Rotas
          </button>
          <button className={`livemap-tab ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            Conta
          </button>
        </div>

        <div className="livemap-tab-content">
          {activeTab === 'buses' && (
            <BusesTab
              buses={buses}
              backendBuses={backendBuses}
              routes={routes}
              selectedBus={selectedBus}
              onBusClick={handleBusClick}
              busSearch={busSearch}
              setBusSearch={setBusSearch}
              busSort={busSort}
              setBusSort={setBusSort}
            />
          )}
          {activeTab === 'routes' && (
            <RoutesTab
              routes={routes}
              stops={stops}
              buses={buses}
              backendBuses={backendBuses}
              selectedRoute={selectedRoute}
              onRouteClick={handleRouteClick}
              routeSearch={routeSearch}
              setRouteSearch={setRouteSearch}
              routeSort={routeSort}
              setRouteSort={setRouteSort}
            />
          )}
          {activeTab === 'account' && <AccountTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Stop panel HTML builders ───
function buildPanelLoading(stop) {
  return `<div class="sp">
    <div class="sp-header">
      <div class="sp-name">${stop.name}</div>
      <div class="sp-code">${stop.code}</div>
    </div>
    <div class="sp-board">
      <div class="sp-board-header">
        <span>Linha</span><span>Tempo</span>
      </div>
      <div class="sp-board-body">
        <div class="sp-empty">A carregar...</div>
      </div>
    </div>
    <div class="sp-coords">${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}</div>
  </div>`;
}

function buildPanelError(stop) {
  return `<div class="sp">
    <div class="sp-header">
      <div class="sp-name">${stop.name}</div>
      <div class="sp-code">${stop.code}</div>
    </div>
    <div class="sp-board">
      <div class="sp-board-header">
        <span>Linha</span><span>Tempo</span>
      </div>
      <div class="sp-board-body">
        <div class="sp-empty">Indisponivel</div>
      </div>
    </div>
    <div class="sp-coords">${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}</div>
  </div>`;
}

function buildPanelHtml(panel) {
  const etas = panel.etas || [];
  let rows = '';
  if (etas.length === 0) {
    rows = '<div class="sp-empty">Sem autocarros a caminho</div>';
  } else {
    etas.forEach(eta => {
      const mins = eta.etaMinutes;
      const timeLabel = mins <= 1 ? 'a chegar' : `${mins} min`;
      rows += `<div class="sp-row">
        <span class="sp-row-badge" style="background:${eta.routeColor}">${eta.routeCode}</span>
        <span class="sp-row-bus">${eta.busCode}</span>
        <span class="sp-row-time ${mins <= 2 ? 'sp-row-soon' : ''}">${timeLabel}</span>
      </div>`;
    });
  }

  const msgHtml = panel.panelMessage
    ? `<div class="sp-message">${panel.panelMessage}</div>` : '';

  return `<div class="sp">
    <div class="sp-header">
      <div class="sp-name">${panel.stopName}</div>
      <div class="sp-code">${panel.stopCode}</div>
    </div>
    <div class="sp-board">
      <div class="sp-board-header">
        <span>Linha</span><span>Autocarro</span><span>Tempo</span>
      </div>
      <div class="sp-board-body">${rows}</div>
    </div>
    ${msgHtml}
  </div>`;
}

// ─── Smooth marker animation helper ───
function animateMarker(marker, from, to, duration) {
  const start = performance.now();
  const fromLat = from.lat, fromLng = from.lng;
  const dLat = to.lat - fromLat, dLng = to.lng - fromLng;

  // Cancel any previous animation on this marker
  if (marker._animFrame) cancelAnimationFrame(marker._animFrame);

  function step(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    // Ease-out cubic for smooth deceleration
    const ease = 1 - Math.pow(1 - t, 3);
    marker.setLatLng([fromLat + dLat * ease, fromLng + dLng * ease]);
    if (t < 1) {
      marker._animFrame = requestAnimationFrame(step);
    } else {
      marker._animFrame = null;
    }
  }
  marker._animFrame = requestAnimationFrame(step);
}
