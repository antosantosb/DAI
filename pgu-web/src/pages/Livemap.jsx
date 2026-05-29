import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { createStompClient } from '../services/stompClient';
import api from '../services/api';
import {
  DEFAULT_CENTER, DEFAULT_ZOOM, WS_URL,
  getBusDisplayStatus, createBusIcon, busPopupHtml,
} from '../components/livemap/constants';
import BusesTab from '../components/livemap/BusesTab';
import RoutesTab from '../components/livemap/RoutesTab';
import SidebarUserMenu from '../components/SidebarUserMenu';
import { useAuth } from '../context/AuthProvider';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeSwitcher from '../components/ThemeSwitcher';
import TubLogo from '../components/TubLogo';
import ProjectDisclaimer from '../components/ProjectDisclaimer';
import './Livemap.css';

export default function Livemap() {
  const { t } = useTranslation();
  const { username, roles, logout } = useAuth();
  // Sprint 1 follow-up: substituido o tab Account pelo widget partilhado
  // SidebarUserMenu no fim da sidebar (consistente com o backoffice).
  const [meProfile, setMeProfile] = useState(null);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const tileLayerRef = useRef(null);
  const stopLayerGroup = useRef(null);
  const routeLayerGroup = useRef(null);
  // Feature "ver trajetos da rota": layer DEDICADA para o realce do pattern
  // selecionado. Separada de routeLayerGroup para nao interferir com o
  // desenho normal das rotas (requisito de seguranca).
  const patternHighlightLayerRef = useRef(null);
  // Guarda o padrao actualmente pedido, para descartar fetches obsoletos
  // (ao trocar rapidamente de padrao, o fetch anterior nao deve redesenhar).
  const drawnPatternRef = useRef(null);
  const busClusterGroup = useRef(null);
  const busMarkersRef = useRef({});
  const busStatusRef = useRef({});
  const trailsRef = useRef({});
  const trailLayerRef = useRef(null);
  const followingBusRef = useRef(null);
  const hasInitialFit = useRef(false);
  const prevSelectedRouteRef = useRef(null);
  const prevRouteBeforeBusRef = useRef(null);
  const backendBusesRef = useRef({});
  // Sprint 1 (F2): ref para o telemetry state — usado no filtro
  // "Em servico" sem adicionar o `buses` state ao dep array do polyline
  // draw (que causaria re-render a cada tick).
  const busesRef = useRef({});
  // Sprint 1 (F2 fix): popup STANDALONE (na layer do mapa, nao bound ao
  // marker). Imune ao remove/re-add que o markercluster faz aos markers a
  // cada 'move' — que com bound popup causava o pisca-pisca. O follow e' por
  // rAF (so' posicao, sem tocar conteudo).
  const activePopupRef = useRef(null);
  const activePopupBusIdRef = useRef(null);
  const popupFollowRafRef = useRef(null);
  const openBusPopupRef = useRef(null);
  const selectedRouteRef = useRef(null);

  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [segments, setSegments] = useState({});
  // Sprint 1 (F2): adherence stoplight por rota + toggle do overlay
  const [adherenceMap, setAdherenceMap] = useState({});
  const [adherenceLayerOn, setAdherenceLayerOn] = useState(false);
  // Sprint 1 (F2): toggle "mostrar so rotas com autocarros activos"
  const [onlyActiveRoutes, setOnlyActiveRoutes] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedBus, setSelectedBus] = useState(null);
  // Feature "ver trajetos da rota": patterns (trajetos distintos) da rota
  // selecionada + qual esta realcado no mapa.
  const [patterns, setPatterns] = useState([]);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState(null);
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
  const [visibleLayers, setVisibleLayers] = useState({ stops: true, routes: true, buses: true });
  // Sprint 1 follow-up: layer panel collapse (persistido).
  const [layersCollapsed, setLayersCollapsed] = useState(() => {
    try { return localStorage.getItem('pgu:livemap-layers-collapsed') === '1'; }
    catch { return false; }
  });
  const toggleLayersCollapsed = () => {
    setLayersCollapsed((v) => {
      const nv = !v;
      try { localStorage.setItem('pgu:livemap-layers-collapsed', nv ? '1' : '0'); } catch { /* noop */ }
      return nv;
    });
  };
  const heatLayerRef = useRef(null);
  const congestionLayerRef = useRef(null);
  const stompClientRef = useRef(null);

  // ─── Profile do utilizador (para o SidebarUserMenu) ───
  useEffect(() => {
    let mounted = true;
    api.get('/me')
      .then(({ data }) => { if (mounted) setMeProfile(data); })
      .catch(() => { /* silencioso — Avatar mostra a inicial como fallback */ });
    return () => { mounted = false; };
  }, []);

  // Sprint 1 (F2): adherence stoplight por rota. Refresh a cada 30s para
  // o pill e o overlay reflectirem a telemetria recente.
  useEffect(() => {
    let mounted = true;
    const fetchAdherence = () => {
      api.get('/analytics/route-adherence')
        .then(({ data }) => {
          if (!mounted) return;
          const map = {};
          for (const row of data || []) map[row.routeId] = row;
          setAdherenceMap(map);
        })
        .catch(() => { /* silencioso — sem dados nao quebra UI */ });
    };
    fetchAdherence();
    const id = setInterval(fetchAdherence, 30000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // Sincronizar com upload/remocao de avatar feitos noutras paginas.
  useEffect(() => {
    const handler = (e) => {
      setMeProfile((prev) => prev ? { ...prev, avatarUrl: e.detail?.avatarUrl ?? null } : prev);
    };
    window.addEventListener('pgu:avatar-updated', handler);
    return () => window.removeEventListener('pgu:avatar-updated', handler);
  }, []);

  const fullName = meProfile
    ? [meProfile.firstName, meProfile.lastName].filter(Boolean).join(' ').trim()
    : '';
  const displayRole = roles?.includes('admin')
    ? t('auth.roles.admin')
    : roles?.includes('developer')
      ? t('auth.roles.developer')
      : roles?.includes('motorista')
        ? t('auth.roles.motorista')
        : t('auth.roles.funcionario');

  // ─── Map initialization ───
  useEffect(() => {
    if (mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      // Sprint 1 follow-up: desativamos o zoomControl default (top-left) e
      // criamos um manualmente abaixo, posicionado deliberadamente debaixo
      // do card LAYERS para nao haver overlap.
      zoomControl: false,
      preferCanvas: true,
      // Sprint 1 (F1): atribuicao "Leaflet" desactivada — mantemos so a OSM
      // (obrigatoria por licenca ODbL). Estilizada compacta via CSS (.lm-attr).
      attributionControl: false,
    });
    L.control.zoom({ position: 'topleft' }).addTo(mapInstance.current);
    L.control.attribution({ position: 'bottomright', prefix: '' })
      .addTo(mapInstance.current);

    tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapInstance.current);

    stopLayerGroup.current = L.layerGroup().addTo(mapInstance.current);
    routeLayerGroup.current = L.layerGroup().addTo(mapInstance.current);
    // Feature "ver trajetos da rota": layer do realce do pattern, adicionada
    // ao mapa uma unica vez. Fica por cima das rotas (adicionada depois).
    patternHighlightLayerRef.current = L.layerGroup().addTo(mapInstance.current);

    // ─── Cluster group para autocarros (F8, requisito do plano) ───
    busClusterGroup.current = L.markerClusterGroup({
      disableClusteringAtZoom: 16,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      // Sem animacoes de cluster: o re-cluster a cada telemetria causava
      // jank. O popup standalone (F2) ja' nao depende do estado do cluster.
      animate: false,
      animateAddingMarkers: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: 'marker-cluster marker-cluster-pgu',
          iconSize: L.point(40, 40),
        });
      },
    }).addTo(mapInstance.current);

    // Sprint 1 (F2 fix): ao mudar de zoom, re-indexar os clusters para que
    // markers movidos via setLatLng nao "saltem" para a posicao antiga do
    // grid. So' no zoomend (nao por tick) para evitar churn/flicker.
    mapInstance.current.on('zoomend', () => {
      busClusterGroup.current?.refreshClusters?.();
    });

    // Sprint 1 (F2 fix): click directo no marker → marker.on('click') abre o
    // popup standalone (openBusPopup). O freeze no mousedown garante que o
    // click regista mesmo com o marker em movimento.

    mapInstance.current.on('dragstart', () => { followingBusRef.current = null; });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  // ─── Load stops + routes + segments ───
  // Sprint 0 (F2): pattern AbortController.
  // Se o utilizador navegar para fora do LiveMap antes destes 3 fetches
  // terminarem, o componente desmonta e React queixa-se de setState num
  // componente unmounted. O AbortController cancela os requests pendentes
  // no cleanup. O axios interceptor (api.js) deteta ERR_CANCELED e nao
  // mostra toast de erro. Pattern a replicar nos restantes useEffects e
  // em sprints seguintes.
  useEffect(() => {
    const ctrl = new AbortController();
    const opts = { signal: ctrl.signal };
    const ignoreCanceled = (err) => {
      if (err?.code !== 'ERR_CANCELED' && err?.name !== 'CanceledError') {
        console.error('Livemap fetch falhou:', err);
      }
    };

    api.get('/stops', opts).then(r => setStops(r.data || [])).catch(err => {
      ignoreCanceled(err);
      if (!ctrl.signal.aborted) setStops([]);
    });
    api.get('/routes', opts).then(r => setRoutes(r.data || [])).catch(err => {
      ignoreCanceled(err);
      if (!ctrl.signal.aborted) setRoutes([]);
    });
    api.get('/route-segments', opts).then(r => {
      const allSegments = {};
      (r.data || []).forEach(seg => {
        if (!allSegments[seg.routeId]) allSegments[seg.routeId] = [];
        allSegments[seg.routeId].push(seg);
      });
      setSegments(allSegments);
    }).catch(err => {
      ignoreCanceled(err);
      if (!ctrl.signal.aborted) setSegments({});
    });

    return () => ctrl.abort();
  }, []);

  // ─── Update / create bus marker on map (via cluster group) ───
  const updateBusMarker = useCallback((telemetry) => {
    const map = mapInstance.current;
    const cluster = busClusterGroup.current;
    if (!map || !cluster || !telemetry.latitude || !telemetry.longitude) return;

    const backend = backendBusesRef.current[telemetry.busId];
    // Autocarros parados ou sem registo no backend não aparecem no mapa
    if (backend?.status === 'STOPPED' || (Object.keys(backendBusesRef.current).length > 0 && !backend)) {
      const existing = busMarkersRef.current[telemetry.busId];
      if (existing) {
        // Remover do cluster antes de apagar a referência
        cluster.removeLayer(existing);
        if (map.hasLayer(existing)) map.removeLayer(existing);
        delete busMarkersRef.current[telemetry.busId];
        delete trailsRef.current[telemetry.busId];
      }
      return;
    }
    const displayStatus = getBusDisplayStatus(backend?.status, telemetry.status);
    const newLatLng = L.latLng(telemetry.latitude, telemetry.longitude);

    const existing = busMarkersRef.current[telemetry.busId];
    if (existing) {
      // Sprint 1 (F2 fix): se o marker esta' congelado (mousedown a decorrer),
      // NAO o movemos — deixa o click completar. A posicao apanha no proximo
      // tick apos o freeze acabar.
      if (!existing._clickFreeze) {
        const oldLatLng = existing.getLatLng();
        const dist = oldLatLng.distanceTo(newLatLng);
        if (dist > 1 && dist < 2000) {
          animateMarker(existing, oldLatLng, newLatLng, 800);
        } else {
          existing.setLatLng(newLatLng);
        }
      }
      if (busStatusRef.current[telemetry.busId] !== displayStatus) {
        existing.setIcon(createBusIcon(displayStatus));
        busStatusRef.current[telemetry.busId] = displayStatus;
      }
      // Sprint 1 (F2 fix): se o popup standalone activo e' deste bus,
      // actualizar conteudo (1Hz). A POSICAO e' tratada pelo follow rAF.
      if (activePopupBusIdRef.current === telemetry.busId && activePopupRef.current) {
        activePopupRef.current.setContent(busPopupHtml(telemetry, displayStatus));
      }
    } else {
      const marker = L.marker(newLatLng, {
        icon: createBusIcon(displayStatus),
        zIndexOffset: 1000,
      });
      marker.busId = telemetry.busId;
      const thisBusId = telemetry.busId;
      // Sprint 1 (F2 fix): abrir o popup STANDALONE no click do marker.
      marker.on('click', () => openBusPopupRef.current?.(thisBusId));
      // Sprint 1 (F2 fix): CONGELAR o marker no mousedown. Um click precisa de
      // mousedown+mouseup no mesmo elemento; se a telemetria (websocket)
      // dispara animateMarker entre os dois, o marker move-se e o mouseup
      // falha o alvo → o click nao regista. Congelar 450ms deixa o click
      // completar com o marker parado; depois a animacao retoma.
      marker.on('mousedown', () => {
        marker._clickFreeze = true;
        if (marker._animFrame) {
          cancelAnimationFrame(marker._animFrame);
          marker._animFrame = null;
        }
        if (marker._freezeTimer) clearTimeout(marker._freezeTimer);
        marker._freezeTimer = setTimeout(() => { marker._clickFreeze = false; }, 450);
      });
      // Só adicionar ao mapa se passar nos filtros ativos (bus focus ou route filter)
      const focusedBus = followingBusRef.current;
      const filteredRoute = selectedRouteRef.current;
      const busRoute = backendBusesRef.current[telemetry.busId]?.routeId;
      const shouldShow = focusedBus
        ? focusedBus === telemetry.busId
        : !filteredRoute || busRoute === filteredRoute;
      if (shouldShow) {
        cluster.addLayer(marker);
      }
      busMarkersRef.current[telemetry.busId] = marker;
      busStatusRef.current[telemetry.busId] = displayStatus;
    }

    // ─── Trail (rasto) do autocarro selecionado ───
    if (followingBusRef.current === telemetry.busId) {
      const trail = trailsRef.current[telemetry.busId] || [];
      trail.push([telemetry.latitude, telemetry.longitude]);
      if (trail.length > 20) trail.shift();
      trailsRef.current[telemetry.busId] = trail;
      if (trailLayerRef.current && map.hasLayer(trailLayerRef.current)) {
        trailLayerRef.current.setLatLngs(trail);
      }
      map.setView(newLatLng, map.getZoom(), { animate: true, duration: 0.8 });
    }
  }, []);

  // ─── Load backend bus states ───
  // Sprint 1 (F2): sync state -> ref para o filtro "Em servico" no draw das polylines
  useEffect(() => { busesRef.current = buses; }, [buses]);

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
    const cluster = busClusterGroup.current;
    if (!map || !Object.keys(backendBuses).length) return;
    Object.entries(busMarkersRef.current).forEach(([busId, marker]) => {
      const backend = backendBuses[busId];
      // Remove se: parado, ou não existe no backend (descomissionado/eliminado)
      if (!backend || backend.status === 'STOPPED') {
        if (cluster) cluster.removeLayer(marker);
        if (map.hasLayer(marker)) map.removeLayer(marker);
        delete busMarkersRef.current[busId];
        delete busStatusRef.current[busId];
        delete trailsRef.current[busId];
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

    // Sprint -1 (SEC-4): client autenticado via JWT no CONNECT.
    const client = createStompClient({
      onConnect: () => {
        stompClientRef.current = client;
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
      onDisconnect: () => {
        stompClientRef.current = null;
        setWsConnected(false);
      },
      onStompError: () => {
        stompClientRef.current = null;
        setWsConnected(false);
      },
    });

    client.activate();

    return () => {
      stompClientRef.current = null;
      client.deactivate();
      const cluster = busClusterGroup.current;
      Object.values(busMarkersRef.current).forEach(m => {
        if (cluster) cluster.removeLayer(m);
        if (mapInstance.current && mapInstance.current.hasLayer(m)) mapInstance.current.removeLayer(m);
      });
      busMarkersRef.current = {};
      trailsRef.current = {};
    };
  }, [updateBusMarker]);

  // ─── Heatmap layer toggle ───
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (!showHeatmap) {
      // Restaurar camadas normais (respeitando toggles)
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      if (stopLayerGroup.current && visibleLayers.stops && !map.hasLayer(stopLayerGroup.current)) {
        map.addLayer(stopLayerGroup.current);
      }
      if (routeLayerGroup.current && visibleLayers.routes && !map.hasLayer(routeLayerGroup.current)) {
        map.addLayer(routeLayerGroup.current);
      }
      if (busClusterGroup.current && visibleLayers.buses && !map.hasLayer(busClusterGroup.current)) {
        map.addLayer(busClusterGroup.current);
      }
      return;
    }

    // Esconder tudo para o heatmap ficar limpo
    if (stopLayerGroup.current && map.hasLayer(stopLayerGroup.current)) {
      map.removeLayer(stopLayerGroup.current);
    }
    if (routeLayerGroup.current && map.hasLayer(routeLayerGroup.current)) {
      map.removeLayer(routeLayerGroup.current);
    }
    if (busClusterGroup.current && map.hasLayer(busClusterGroup.current)) {
      map.removeLayer(busClusterGroup.current);
    }

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
              0.2: '#009BDB',
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
  }, [showHeatmap, visibleLayers]);

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
                <strong>${c.busId}</strong>${c.routeCode ? ` · <span style="color:#009BDB">${c.routeCode}</span>` : ''}<br/>
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

  // ─── Toggle visibility de stops / routes / buses (cluster) ───
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || showHeatmap) return; // o heatmap controla a visibilidade quando está activo

    if (stopLayerGroup.current) {
      if (visibleLayers.stops) {
        if (!map.hasLayer(stopLayerGroup.current)) map.addLayer(stopLayerGroup.current);
      } else if (map.hasLayer(stopLayerGroup.current)) {
        map.removeLayer(stopLayerGroup.current);
      }
    }
    if (routeLayerGroup.current) {
      if (visibleLayers.routes) {
        if (!map.hasLayer(routeLayerGroup.current)) map.addLayer(routeLayerGroup.current);
      } else if (map.hasLayer(routeLayerGroup.current)) {
        map.removeLayer(routeLayerGroup.current);
      }
    }
    if (busClusterGroup.current) {
      if (visibleLayers.buses) {
        if (!map.hasLayer(busClusterGroup.current)) map.addLayer(busClusterGroup.current);
      } else if (map.hasLayer(busClusterGroup.current)) {
        map.removeLayer(busClusterGroup.current);
      }
    }
  }, [visibleLayers, showHeatmap]);

  // ─── Pre-compute map data ───
  const stopMap = useMemo(() => {
    const map = {};
    stops.forEach(s => { map[s.id] = s; });
    return map;
  }, [stops]);

  const routePolylineData = useMemo(() => {
    return routes.map(route => {
      const color = route.color || '#009BDB';
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
    // Sprint 1 (F2): se onlyActiveRoutes ON, so' desenhamos rotas com >= 1 bus
    // activo. Identificamos rotas activas a partir dos backendBuses.
    // Feature "ver trajetos": com uma rota selecionada, a linha vem da camada
    // dos padroes (drawPattern desenha o padrao escolhido na cor da rota + as
    // paragens). Por isso aqui NAO desenhamos a linha representativa — so na
    // vista geral (sem selecao), que e' o "canal" ao nivel da rede.
    let routesToDraw = selectedRoute ? [] : routePolylineData;
    if (!selectedRoute && onlyActiveRoutes) {
      // Sprint 1 (F2 fix): rota "em servico" = tem >= 1 autocarro NAO
      // desativado. Um autocarro azul (at-stop) ESTA' em servico — so'
      // parou momentaneamente numa paragem. Apenas autocarros deactivated
      // (backend STOPPED) nao contam.
      const activeIds = new Set();
      Object.values(busesRef.current || {}).forEach(b => {
        if (!b?.busId) return;
        const backend = backendBusesRef.current[b.busId];
        const displayStatus = getBusDisplayStatus(backend?.status, b.status);
        if (displayStatus !== 'deactivated') {
          const routeId = backend?.routeId;
          if (routeId) activeIds.add(routeId);
        }
      });
      routesToDraw = routesToDraw.filter(r => activeIds.has(r.id));
    }

    // Sprint 1 (F2): se a layer de adherence estiver ON, override a cor
    // pela classificacao stoplight (verde/amarelo/vermelho).
    const ADHERENCE_HEX = { green: '#10b981', yellow: '#f59e0b', red: '#ef4444' };
    routesToDraw.forEach(({ id, name, code, color, latlngs }) => {
      const adherenceColor = adherenceLayerOn && adherenceMap[id]
        ? (ADHERENCE_HEX[adherenceMap[id].color] || color)
        : color;
      const polyline = L.polyline(latlngs, {
        color: adherenceColor,
        weight: adherenceLayerOn ? 5 : 4,
        opacity: 0.85,
      });
      const adherenceInfo = adherenceLayerOn && adherenceMap[id]
        ? `<br/><small>Adherence: ${adherenceMap[id].color} · atraso ${adherenceMap[id].avgDelayMin}m</small>`
        : '';
      polyline.bindPopup(`<strong>${name}</strong><br/><code>${code}</code>${adherenceInfo}`);
      routeLayerGroup.current.addLayer(polyline);
    });

    // Draw stop markers.
    // Feature "ver trajetos": com uma rota selecionada NAO desenhamos as
    // paragens gerais (estilo antigo) — as paragens do padrao escolhido sao
    // desenhadas por drawPattern (novo modelo). So' na vista geral mostramos
    // todas as paragens.
    const stopsToShow = selectedRoute ? [] : stops;

    stopsToShow.forEach(stop => {
      if (stop.latitude == null || stop.longitude == null) return;
      // Revamp: ponto mais pequeno e crisp (borda fina), ligeiramente
      // translucido para nao saturar quando ha' muitas paragens. Distinto
      // dos marcadores do padrao (maiores e na cor da rota).
      const marker = L.circleMarker([stop.latitude, stop.longitude], {
        radius: 5,
        fillColor: '#009BDB',
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.92,
        opacity: 0.85,
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
    // Sprint 1 (F2 follow-up): NOT adding `buses`/`backendBuses` to deps.
    // Estado de telemetria muda a cada tick (~1s) — re-correr o draw das
    // polylines a cada tick fazia o map piscar e o popup perder o anchor.
    // Em vez disso lemos das refs (busesRef.current). O custo: ao toggle
    // de onlyActiveRoutes pode levar um tick para reflectir mudancas de
    // estado posteriores; aceitavel.
  }, [stops, routes, routePolylineData, selectedRoute, adherenceMap, adherenceLayerOn, onlyActiveRoutes]);

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

    // Mostrar/esconder markers conforme a rota selecionada (via cluster)
    const cluster = busClusterGroup.current;
    if (map && cluster) {
      Object.entries(busMarkersRef.current).forEach(([busId, m]) => {
        if (!newRoute) {
          if (!cluster.hasLayer(m)) cluster.addLayer(m);
        } else {
          const busRoute = backendBusesRef.current[busId]?.routeId;
          if (busRoute === newRoute) {
            if (!cluster.hasLayer(m)) cluster.addLayer(m);
          } else {
            if (cluster.hasLayer(m)) cluster.removeLayer(m);
          }
        }
      });
    }
  }, [selectedBus, selectedRoute]);

  // ─── Feature "ver trajetos da rota" (patterns) ───
  // Esvazia a layer dedicada do realce. Nao toca em routeLayerGroup.
  const clearPatternHighlight = useCallback(() => {
    patternHighlightLayerRef.current?.clearLayers();
  }, []);

  // Limpar o realce + deselecionar o pattern (botao "limpar" ou re-clique).
  const handlePatternClear = useCallback(() => {
    clearPatternHighlight();
    setSelectedPattern(null);
  }, [clearPatternHighlight]);

  // Desenha um padrao (trajeto) na layer dedicada: a linha NA COR DA ROTA + as
  // paragens do padrao (coordenadas via stopMap). Substitui o que la' estava.
  const drawPattern = useCallback((patternId) => {
    const layer = patternHighlightLayerRef.current;
    const map = mapInstance.current;
    if (!layer || !map) return;
    drawnPatternRef.current = patternId;
    const routeColor = routes.find(r => r.id === selectedRouteRef.current)?.color || '#009BDB';

    api.get(`/patterns/${patternId}/geometry`)
      .then(({ data }) => {
        if (drawnPatternRef.current !== patternId) return; // ja' foi pedido outro padrao
        const points = data?.points || [];
        layer.clearLayers();
        if (points.length >= 2) {
          // points sao [lat, lon] (ordem Leaflet) — usar diretamente.
          const polyline = L.polyline(points, { color: routeColor, weight: 6, opacity: 0.95 });
          layer.addLayer(polyline);
          const bounds = polyline.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        }
        // Paragens do padrao (coordenadas resolvidas pelo stopMap ja' carregado).
        api.get(`/patterns/${patternId}/stops`)
          .then(({ data: stopsData }) => {
            if (drawnPatternRef.current !== patternId) return; // descartar se obsoleto
            (stopsData || []).forEach(s => {
              const sm = stopMap[s.stopId];
              if (!sm) return;
              const marker = L.circleMarker([sm.latitude, sm.longitude], {
                radius: 6, color: '#fff', weight: 2, fillColor: routeColor, fillOpacity: 0.95,
              });
              marker.bindTooltip(`${s.stopName}`, { direction: 'top' });
              layer.addLayer(marker);
            });
          })
          .catch(() => { /* paragens sao opcionais para o realce */ });
      })
      .catch((err) => {
        if (err?.code !== 'ERR_CANCELED' && err?.name !== 'CanceledError') {
          console.error('Falha ao carregar geometria do pattern:', err);
        }
      });
  }, [routes, stopMap]);

  // Clicar num pattern: troca o trajeto mostrado (re-clique no mesmo = no-op).
  const handlePatternSelect = useCallback((patternId) => {
    if (selectedPattern === patternId) return;
    setSelectedPattern(patternId);
    drawPattern(patternId);
  }, [selectedPattern, drawPattern]);

  // Quando a rota selecionada muda (ou e' deselecionada), ir buscar os
  // patterns dessa rota. A limpeza do realce + lista + selecao anterior e'
  // feita na funcao de cleanup (corre antes do efeito seguinte e no
  // unmount), evitando setState sincrono no corpo do efeito.
  useEffect(() => {
    if (!selectedRoute) return undefined;

    const ctrl = new AbortController();
    // Sincronizacao com sistema externo (selecao de rota -> fetch async):
    // o flag de loading tem de ligar antes do fetch resolver. Mesmo padrao
    // ja' usado noutros efeitos deste ficheiro.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPatternsLoading(true);
    api.get(`/routes/${selectedRoute}/patterns`, { signal: ctrl.signal })
      .then(({ data }) => {
        const pats = data || [];
        setPatterns(pats);
        setPatternsLoading(false);
        // Auto-selecciona o 1.o padrao da lista (direcao 0, id mais baixo) e desenha-o.
        if (pats.length > 0) {
          setSelectedPattern(pats[0].id);
          drawPattern(pats[0].id);
        }
      })
      .catch((err) => {
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
        console.error('Falha ao carregar patterns da rota:', err);
        setPatterns([]);
        setPatternsLoading(false);
      });

    return () => {
      ctrl.abort();
      clearPatternHighlight();
      setPatterns([]);
      setPatternsLoading(false);
      setSelectedPattern(null);
    };
  }, [selectedRoute, clearPatternHighlight, drawPattern]);

  // Sprint 1 (F2 fix): popup STANDALONE na layer do mapa (nao bound ao
  // marker). Imune ao remove/re-add que o markercluster faz aos markers a
  // cada move. Segue o marker por rAF (so' posicao). Troca explicita: fecha
  // o anterior antes de abrir o novo.
  const openBusPopup = useCallback((busId) => {
    const map = mapInstance.current;
    const marker = busMarkersRef.current[busId];
    const telemetry = busesRef.current[busId];
    if (!map || !marker || !telemetry) return;
    if (popupFollowRafRef.current) {
      cancelAnimationFrame(popupFollowRafRef.current);
      popupFollowRafRef.current = null;
    }
    if (activePopupRef.current) {
      map.closePopup(activePopupRef.current);
      activePopupRef.current = null;
      activePopupBusIdRef.current = null;
    }
    const backend = backendBusesRef.current[busId];
    const status = getBusDisplayStatus(backend?.status, telemetry.status);
    const popup = L.popup({
      autoClose: false,
      autoPan: false, // o popup segue o bus via rAF; autoPan faria o map jiggle
      closeOnClick: true,
      offset: [0, -16],
    })
      .setLatLng(marker.getLatLng())
      .setContent(busPopupHtml(telemetry, status))
      .openOn(map);
    activePopupRef.current = popup;
    activePopupBusIdRef.current = busId;
    const follow = () => {
      if (activePopupRef.current !== popup) { popupFollowRafRef.current = null; return; }
      const m = busMarkersRef.current[busId];
      if (m) popup.setLatLng(m.getLatLng());
      popupFollowRafRef.current = requestAnimationFrame(follow);
    };
    popupFollowRafRef.current = requestAnimationFrame(follow);
    popup.on('remove', () => {
      if (popupFollowRafRef.current) {
        cancelAnimationFrame(popupFollowRafRef.current);
        popupFollowRafRef.current = null;
      }
      if (activePopupRef.current === popup) {
        activePopupRef.current = null;
        activePopupBusIdRef.current = null;
      }
    });
  }, []);

  useEffect(() => { openBusPopupRef.current = openBusPopup; }, [openBusPopup]);

  const handleBusClick = useCallback((bus) => {
    const map = mapInstance.current;
    const cluster = busClusterGroup.current;
    const isSelected = selectedBus === bus.busId;
    if (isSelected) {
      // Deselecionar — restaurar visibilidade conforme a rota anterior
      setSelectedBus(null);
      const prevRoute = prevRouteBeforeBusRef.current;
      setSelectedRoute(prevRoute);
      selectedRouteRef.current = prevRoute;
      followingBusRef.current = null;
      prevRouteBeforeBusRef.current = null;
      // Sprint 1 (F2 fix): fechar o popup standalone do bus desselecionado
      if (map && activePopupRef.current && activePopupBusIdRef.current === bus.busId) {
        map.closePopup(activePopupRef.current);
      }
      // Limpar trail do bus desselecionado
      if (trailLayerRef.current && map) {
        if (map.hasLayer(trailLayerRef.current)) map.removeLayer(trailLayerRef.current);
        trailLayerRef.current = null;
      }
      trailsRef.current[bus.busId] = [];
      if (map && cluster) {
        Object.entries(busMarkersRef.current).forEach(([busId, m]) => {
          if (!prevRoute) {
            if (!cluster.hasLayer(m)) cluster.addLayer(m);
          } else {
            const busRoute = backendBusesRef.current[busId]?.routeId;
            if (busRoute === prevRoute) {
              if (!cluster.hasLayer(m)) cluster.addLayer(m);
            } else {
              if (cluster.hasLayer(m)) cluster.removeLayer(m);
            }
          }
        });
      }
    } else {
      if (!selectedBus) {
        prevRouteBeforeBusRef.current = selectedRoute;
      }
      // Limpar trail anterior (se mudou de bus seleccionado)
      if (trailLayerRef.current && map) {
        if (map.hasLayer(trailLayerRef.current)) map.removeLayer(trailLayerRef.current);
        trailLayerRef.current = null;
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
      // Esconder todos os markers excepto o selecionado (via cluster)
      if (map && cluster) {
        Object.entries(busMarkersRef.current).forEach(([id, m]) => {
          if (id === bus.busId) {
            if (!cluster.hasLayer(m)) cluster.addLayer(m);
          } else {
            if (cluster.hasLayer(m)) cluster.removeLayer(m);
          }
        });
      }
      // Inicializar trail com a posição actual e criar polyline
      if (map && bus.latitude && bus.longitude) {
        const lat = bus.latitude, lng = bus.longitude, busId = bus.busId;
        const initialTrail = [[lat, lng]];
        trailsRef.current[busId] = initialTrail;
        const primaryColor =
          getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#009BDB';
        trailLayerRef.current = L.polyline(initialTrail, {
          color: primaryColor,
          weight: 4,
          opacity: 0.7,
          smoothFactor: 1,
        }).addTo(map);
        // Sprint 1 (F2 fix): abrir o popup (bound) APOS o flyTo terminar.
        setTimeout(() => {
          map.flyTo([lat, lng], 16, { duration: 1.2, easeLinearity: 0.25 });
          map.once('moveend', () => {
            openBusPopup(busId);
          });
        }, 0);
      }
    }
  }, [selectedBus, selectedRoute, backendBuses, openBusPopup]);


  const subscribeToMessages = useCallback((busId, callback) => {
    if (!stompClientRef.current || !wsConnected) {
      console.warn("STOMP client is not connected. Deferring message subscription.");
      return null;
    }
    return stompClientRef.current.subscribe(`/topic/mensagens/${busId}`, (msg) => {
      const update = JSON.parse(msg.body);
      callback(update);
    });
  }, [wsConnected]);

  const checkIfOnline = useCallback((bus) => {
    if (!bus.timestamp) return false;
    const lastTime = new Date(bus.timestamp).getTime();
    const now = Date.now();
    return (now - lastTime) < 30000; // 30s latency threshold
  }, []);

  return (
    <div className="livemap-wrapper">
      <div className="livemap-map-wrap">
        <div className="livemap-map" ref={mapRef} />
        <div className={`livemap-overlay-controls${layersCollapsed ? ' livemap-overlay-controls--collapsed' : ''}`}>
          <button
            type="button"
            className="livemap-overlay-header"
            onClick={toggleLayersCollapsed}
            aria-expanded={!layersCollapsed}
            aria-controls="livemap-layer-items"
            title={layersCollapsed ? t('livemap.layersExpand') : t('livemap.layersCollapse')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 22 8.5 12 15 2 8.5 12 2" />
              <polyline points="2 15.5 12 22 22 15.5" />
            </svg>
            <span className="livemap-overlay-header-label">{t('livemap.layersHeader')}</span>
            <svg className="livemap-overlay-header-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div id="livemap-layer-items" className="livemap-overlay-items">
          <button
            className={`livemap-overlay-btn${showHeatmap ? ' livemap-overlay-btn--active' : ''}`}
            onClick={() => { setShowHeatmap(h => !h); if (!showHeatmap) setShowCongestion(false); }}
            title={showHeatmap ? t('livemap.heatmapOff') : t('livemap.heatmapOn')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2c-4 4-8 7.5-8 12a8 8 0 0 0 16 0c0-4.5-4-8-8-12z" />
            </svg>
            {t('livemap.heatmap')}
          </button>
          <button
            className={`livemap-overlay-btn livemap-overlay-btn--danger${showCongestion ? ' livemap-overlay-btn--active' : ''}`}
            onClick={() => setShowCongestion(c => !c)}
            title={showCongestion ? t('livemap.trafficOff') : t('livemap.trafficOn')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {t('livemap.traffic')}
          </button>
          <button
            className={`livemap-overlay-btn${visibleLayers.stops ? ' livemap-overlay-btn--active' : ''}`}
            onClick={() => setVisibleLayers(v => ({ ...v, stops: !v.stops }))}
            title={t('livemap.toggleStops')}
            aria-pressed={visibleLayers.stops}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>
            </svg>
            {t('livemap.stops')}
          </button>
          <button
            className={`livemap-overlay-btn${visibleLayers.routes ? ' livemap-overlay-btn--active' : ''}`}
            onClick={() => setVisibleLayers(v => ({ ...v, routes: !v.routes }))}
            title={t('livemap.toggleRoutes')}
            aria-pressed={visibleLayers.routes}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 18 L9 13 L14 16 L20 6" /><circle cx="4" cy="18" r="1.5" fill="currentColor"/><circle cx="20" cy="6" r="1.5" fill="currentColor"/>
            </svg>
            {t('livemap.route')}
          </button>
          {/* Sprint 1 (F2): toggle "Mostrar so' rotas com autocarros activos" */}
          <button
            className={`livemap-overlay-btn${onlyActiveRoutes ? ' livemap-overlay-btn--active' : ''}`}
            onClick={() => setOnlyActiveRoutes(v => !v)}
            title={t('livemap.toggleActiveOnly')}
            aria-pressed={onlyActiveRoutes}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h13" /><path d="M3 12h9" /><path d="M3 18h5" />
              <circle cx="19" cy="18" r="3" fill="currentColor" stroke="none" />
            </svg>
            {t('livemap.activeOnly')}
          </button>
          {/* Sprint 1 (F2): toggle Adherence stoplight (R.IVT.06) */}
          <button
            className={`livemap-overlay-btn${adherenceLayerOn ? ' livemap-overlay-btn--active' : ''}`}
            onClick={() => setAdherenceLayerOn(v => !v)}
            title={t('livemap.toggleAdherence')}
            aria-pressed={adherenceLayerOn}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="20" rx="3"/>
              <circle cx="12" cy="7" r="1.5" fill="#10b981" stroke="none"/>
              <circle cx="12" cy="12" r="1.5" fill="#f59e0b" stroke="none"/>
              <circle cx="12" cy="17" r="1.5" fill="#ef4444" stroke="none"/>
            </svg>
            {t('livemap.adherence')}
          </button>
          <button
            className={`livemap-overlay-btn${visibleLayers.buses ? ' livemap-overlay-btn--active' : ''}`}
            onClick={() => setVisibleLayers(v => ({ ...v, buses: !v.buses }))}
            title={t('livemap.toggleBuses')}
            aria-pressed={visibleLayers.buses}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4S4 2.5 4 6v10zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM18 11H6V6h12v5z"/></svg>
            {t('livemap.tabs.buses')}
          </button>
          </div>
        </div>
        <div className="livemap-lang">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </div>

      <div className="livemap-sidebar">
        <div className="livemap-header">
          <div className="livemap-brand">
            <TubLogo size={26} />
            <span className="livemap-brand-divider" aria-hidden="true" />
            <span className="livemap-brand-label">{t('livemap.title')}</span>
          </div>
          <span className={`livemap-ws-badge ${wsConnected ? 'connected' : ''}`}>
            <span className="livemap-ws-dot" />
            {wsConnected ? t('livemap.live') : t('livemap.offline')}
          </span>
        </div>

        <div className="livemap-tabs">
          <button className={`livemap-tab ${activeTab === 'buses' ? 'active' : ''}`} onClick={() => setActiveTab('buses')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4S4 2.5 4 6v10zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM18 11H6V6h12v5z"/></svg>
            {t('livemap.tabs.buses')}
          </button>
          <button className={`livemap-tab ${activeTab === 'routes' ? 'active' : ''}`} onClick={() => setActiveTab('routes')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11 17h2v-4h4v-2h-4V7h-2v4H7v2h4v4zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
            {t('livemap.tabs.routes')}
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
              adherenceMap={adherenceMap}
              patterns={patterns}
              patternsLoading={patternsLoading}
              selectedPattern={selectedPattern}
              onPatternClick={handlePatternSelect}
              onPatternClear={handlePatternClear}
            />
          )}
        </div>

        {/* Sprint 1 follow-up: widget de utilizador no fim — substitui o
            antigo tab Account, consistente com o footer do backoffice. */}
        <div className="livemap-sidebar-footer">
          <SidebarUserMenu
            avatarUrl={meProfile?.avatarUrl}
            name={fullName || username || '?'}
            username={username}
            displayRole={displayRole}
            onLogout={logout}
          />
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
  // Sprint 1 (F2 fix): se o marker esta' congelado (click a decorrer), nao
  // animar — evita que o alvo do click se mova.
  if (marker._clickFreeze) return;
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
    // O popup standalone segue por rAF proprio (openBusPopup), nao aqui.
    if (t < 1) {
      marker._animFrame = requestAnimationFrame(step);
    } else {
      marker._animFrame = null;
    }
  }
  marker._animFrame = requestAnimationFrame(step);
}
