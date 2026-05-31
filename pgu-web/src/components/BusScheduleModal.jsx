// Fase E (E-front-1) — redesign (#4a):
//
// Modal de planeamento de escala (bus_duty) em 2 colunas:
//
//   ESQUERDA (decisoes)            DIREITA (visualizacao + selecao)
//   ┌─ 1 Linha (select)            ┌─ Mini-mapa do padrao escolhido
//   ├─ 2 Padrao (cards)            └─ Lista de viagens (com tags PASSOU/SOBREPOE)
//   └─ 3 Data (date picker)
//
// Submete POST /api/v1/buses/{busId}/duties { patternId, serviceDate, tripIds[] }.
// O backend filtra trips passadas (data=hoje), valida o pattern e devolve 409 se o
// bus nao estiver STOPPED ou se uma trip ja' estiver atribuida nesse dia.
//
// Endpoints:
//   GET /routes
//   GET /routes/{id}/patterns           -> id, directionId, name, stopCount, tripCount
//   GET /patterns/{id}/trips            -> id, firstDeparture, lastArrival, stopCount
//   GET /patterns/{id}/geometry         -> { name, directionId, points: [{type, stopId?, lat, lon}] }

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import './BusScheduleModal.css';

// ─── Time helpers (Europe/Lisbon) ────────────────────────────────────────────
function todayLisbonISO()
{
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date());
}

function nowLisbonSecondsOfDay()
{
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon', hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const h = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
  const s = Number(parts.find(p => p.type === 'second')?.value || 0);
  return h * 3600 + m * 60 + s;
}

function hmsToSeconds(hms)
{
  if (!hms) return null;
  const parts = String(hms).split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const s = Number(parts[2] || 0);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 3600 + m * 60 + s;
}

function formatTime(hms)
{
  if (!hms) return '—';
  const parts = String(hms).split(':');
  if (parts.length < 2) return hms;
  const h = ((Number(parts[0]) || 0) % 24).toString().padStart(2, '0');
  const m = (Number(parts[1]) || 0).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Duracao entre dois HH:MM:SS em formato humano ("45 min", "1 h 5 min").
function formatDuration(startHms, endHms)
{
  const s = hmsToSeconds(startHms);
  const e = hmsToSeconds(endHms);
  if (s == null || e == null) return null;
  let mins = Math.round((e - s) / 60);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// Data por extenso ("Domingo, 31 de maio de 2026" / "Sunday, 31 May 2026").
function formatDateHuman(iso, lang)
{
  if (!iso) return '';
  try {
    const d = new Date(`${iso}T00:00:00`);
    const loc = lang === 'pt' ? 'pt-PT' : 'en-GB';
    return d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

// Sentido por palavras (directionId 0 = Ida, 1 = Volta no GTFS).
function directionLabel(directionId, t)
{
  if (directionId === 0 || directionId === '0') return t('pages.buses.directionOutbound');
  if (directionId === 1 || directionId === '1') return t('pages.buses.directionInbound');
  return t('pages.buses.directionUnknown', { id: directionId ?? '?' });
}

export default function BusScheduleModal({ open, bus, onClose, onCreated, onError })
{
  const { t, i18n } = useTranslation();

  // ─── State ───────────────────────────────────────────────────────────────
  const [routes, setRoutes] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [trips, setTrips] = useState([]);

  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [serviceDate, setServiceDate] = useState(() => todayLisbonISO());
  const [selectedTripIds, setSelectedTripIds] = useState(() => new Set());
  // Filtro por periodo do dia na coluna das viagens (all|morning|afternoon|evening).
  const [periodFilter, setPeriodFilter] = useState('all');

  // Contexto de cada trip ja vista (linha + padrao + horas), keyed por tripId.
  // Persiste para a vista "Horario em construcao" mostrar a linha/padrao
  // mesmo depois de o utilizador mudar de padrao na coluna esquerda.
  // Map<tripId, { routeCode, routeName, patternName, directionId, firstDeparture, lastArrival, stopCount }>
  const [tripContextMap, setTripContextMap] = useState(() => new Map());

  // Passo de revisao final ("rever escala") antes de submeter.
  const [reviewing, setReviewing] = useState(false);

  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingPatterns, setLoadingPatterns] = useState(false);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Geometria do padrao escolhido (para o mini-mapa).
  const [geometry, setGeometry] = useState(null);
  const [loadingGeometry, setLoadingGeometry] = useState(false);

  // Refs para o mapa Leaflet (vanilla; o resto do projeto ja' usa Leaflet directo).
  const mapDivRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const polylineRef = useRef(null);
  const markersLayerRef = useRef(null);

  // Refs para o mapa da vista de REVISAO (varios polylines, 1 por padrao).
  const reviewMapDivRef = useRef(null);
  const reviewMapInstanceRef = useRef(null);
  const reviewLayersRef = useRef(null);
  // Cache de geometrias ja carregadas (patternId -> [[lat,lon], ...]).
  const reviewGeomCacheRef = useRef(new Map());

  // ─── Effects: carregar dados em cascata ──────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setSelectedRouteId('');
    setSelectedPatternId('');
    setServiceDate(todayLisbonISO());
    setPatterns([]);
    setTrips([]);
    setSelectedTripIds(new Set());
    setTripContextMap(new Map());
    setReviewing(false);
    setGeometry(null);

    setLoadingRoutes(true);
    api.get('/routes')
      .then(r => setRoutes(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRoutes([]))
      .finally(() => setLoadingRoutes(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelectedPatternId('');
    setPatterns([]);
    setTrips([]);
    // NAO limpar selectedTripIds: trips de padroes/linhas anteriores ficam.
    setGeometry(null);
    if (!selectedRouteId) return;
    setLoadingPatterns(true);
    api.get(`/routes/${selectedRouteId}/patterns`)
      .then(r => setPatterns(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPatterns([]))
      .finally(() => setLoadingPatterns(false));
  }, [open, selectedRouteId]);

  useEffect(() => {
    if (!open) return;
    setTrips([]);
    // NAO limpar selectedTripIds: mantemos a escolha entre padroes (escala
    // multi-padrao). So' resetamos a lista visivel.
    if (!selectedPatternId) {
      setGeometry(null);
      return;
    }
    setLoadingTrips(true);
    api.get(`/patterns/${selectedPatternId}/trips`)
      .then(r => {
        const arr = Array.isArray(r.data) ? r.data : [];
        arr.sort((a, b) => String(a.firstDeparture || '').localeCompare(String(b.firstDeparture || '')));
        setTrips(arr);
        // Popula o tripContextMap com o contexto (linha + padrao) das trips
        // que aparecem. Mantem o que ja la' estava (de padroes anteriores).
        const route = routes.find(rt => String(rt.id) === String(selectedRouteId));
        const pattern = patterns.find(p => String(p.id) === String(selectedPatternId));
        setTripContextMap(prev => {
          const next = new Map(prev);
          for (const tr of arr) {
            next.set(tr.id, {
              routeCode: route?.code || '',
              routeName: route?.name || '',
              patternId: pattern?.id ?? Number(selectedPatternId),
              patternName: pattern?.name || '',
              directionId: pattern?.directionId,
              firstDeparture: tr.firstDeparture,
              lastArrival: tr.lastArrival,
              stopCount: tr.stopCount,
            });
          }
          return next;
        });
      })
      .catch(() => setTrips([]))
      .finally(() => setLoadingTrips(false));

    // Geometria do padrao para o mini-mapa.
    setLoadingGeometry(true);
    api.get(`/patterns/${selectedPatternId}/geometry`)
      .then(r => setGeometry(r.data || null))
      .catch(() => setGeometry(null))
      .finally(() => setLoadingGeometry(false));
  }, [open, selectedPatternId]);

  // ─── Mapa Leaflet: inicializa quando o modal abre; redesenha ao mudar padrao
  useEffect(() => {
    if (!open) return;
    if (!mapDivRef.current) return;
    if (mapInstanceRef.current) return;
    // Centro inicial = Braga (sera ajustado ao primeiro fitBounds).
    const m = L.map(mapDivRef.current, {
      zoomControl: true, attributionControl: false, scrollWheelZoom: true,
    }).setView([41.5454, -8.4265], 13);
    // CARTO Voyager (usado no resto do projeto: Livemap, PatternEditor).
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(m);
    markersLayerRef.current = L.layerGroup().addTo(m);
    mapInstanceRef.current = m;
    const id = setTimeout(() => m.invalidateSize(), 80);
    return () => clearTimeout(id);
  }, [open]);

  // Limpa o mapa ao fechar.
  useEffect(() => {
    if (open) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      polylineRef.current = null;
      markersLayerRef.current = null;
    }
  }, [open]);

  // Atualiza o polyline + marcadores quando muda a geometria.
  // Shape do endpoint: { id, points: [[lat, lon], [lat, lon], ...] } (arrays).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
    if (markersLayerRef.current) markersLayerRef.current.clearLayers();
    if (!geometry || !Array.isArray(geometry.points) || geometry.points.length === 0) return;

    // Aceita ambos os shapes: arrays [lat, lon] (formato actual do getGeometry) ou
    // objectos { lat, lon } (caso o endpoint evolua).
    const coords = geometry.points
      .map(p => {
        if (Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number') {
          return [p[0], p[1]];
        }
        if (p && typeof p.lat === 'number' && typeof p.lon === 'number') {
          return [p.lat, p.lon];
        }
        return null;
      })
      .filter(Boolean);
    if (coords.length === 0) return;

    polylineRef.current = L.polyline(coords, {
      color: '#009BDB', weight: 4, opacity: 0.85,
    }).addTo(map);

    // Origem/destino: primeiro e ultimo ponto da polyline.
    const first = coords[0];
    const last = coords[coords.length - 1];
    const startIcon = L.divIcon({
      className: 'bsm-map-pin bsm-map-pin--start',
      html: '<span></span>',
      iconSize: [14, 14], iconAnchor: [7, 7],
    });
    const endIcon = L.divIcon({
      className: 'bsm-map-pin bsm-map-pin--end',
      html: '<span></span>',
      iconSize: [14, 14], iconAnchor: [7, 7],
    });
    L.marker(first, { icon: startIcon }).addTo(markersLayerRef.current);
    if (first[0] !== last[0] || first[1] !== last[1]) {
      L.marker(last, { icon: endIcon }).addTo(markersLayerRef.current);
    }

    map.fitBounds(polylineRef.current.getBounds(), { padding: [16, 16] });
  }, [geometry]);

  // ─── Mapa da REVISAO: polylines coloridos por padrao ────────────────────
  // Paleta deterministica (12 cores distintas). Mais que 12 padroes na mesma
  // escala e' improvavel; se acontecer, faz wrap.
  const REVIEW_COLORS = ['#009BDB', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#eab308', '#a855f7'];

  // Padroes UNICOS presentes na escala atual, com cor atribuida e label.
  const reviewPatterns = useMemo(() => {
    const seen = new Map(); // patternId -> { id, routeCode, patternName, directionId, color }
    let i = 0;
    for (const id of selectedTripIds) {
      const ctx = tripContextMap.get(id);
      if (!ctx || ctx.patternId == null) continue;
      if (seen.has(ctx.patternId)) continue;
      seen.set(ctx.patternId, {
        id: ctx.patternId,
        routeCode: ctx.routeCode,
        patternName: ctx.patternName,
        directionId: ctx.directionId,
        color: REVIEW_COLORS[i % REVIEW_COLORS.length],
      });
      i++;
    }
    return Array.from(seen.values());
  }, [selectedTripIds, tripContextMap]);

  // Cria/destroi o mapa da revisao quando entra/sai de review.
  useEffect(() => {
    if (!reviewing) return undefined;
    if (!reviewMapDivRef.current) return undefined;
    if (reviewMapInstanceRef.current) return undefined;
    const m = L.map(reviewMapDivRef.current, {
      zoomControl: true, attributionControl: false, scrollWheelZoom: true,
    }).setView([41.5454, -8.4265], 12);
    // CARTO Voyager (coerente com Livemap/PatternEditor).
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(m);
    reviewLayersRef.current = L.layerGroup().addTo(m);
    reviewMapInstanceRef.current = m;
    // Invalidate em 2 momentos: imediato (proxima frame) + apos transicao
    // de entrada do card (200ms). Sem isto o mapa fica branco porque o
    // container ganha altura DEPOIS da inicializacao do Leaflet.
    const r1 = requestAnimationFrame(() => m.invalidateSize());
    const t1 = setTimeout(() => m.invalidateSize(), 200);
    return () => {
      cancelAnimationFrame(r1);
      clearTimeout(t1);
      if (reviewMapInstanceRef.current) {
        reviewMapInstanceRef.current.remove();
        reviewMapInstanceRef.current = null;
        reviewLayersRef.current = null;
      }
    };
  }, [reviewing]);

  // Carrega as geometrias dos padroes da escala e desenha cada uma com a sua cor.
  useEffect(() => {
    if (!reviewing) return;
    const map = reviewMapInstanceRef.current;
    const layers = reviewLayersRef.current;
    if (!map || !layers) return;
    let cancelled = false;
    layers.clearLayers();

    const colorByPattern = new Map(reviewPatterns.map(p => [p.id, p.color]));
    const allBounds = [];

    (async () => {
      for (const p of reviewPatterns) {
        let coords = reviewGeomCacheRef.current.get(p.id);
        if (!coords) {
          try {
            const r = await api.get(`/patterns/${p.id}/geometry`);
            const points = r.data?.points || [];
            coords = points
              .map(pt => Array.isArray(pt) ? [pt[0], pt[1]]
                : (pt && typeof pt.lat === 'number' && typeof pt.lon === 'number' ? [pt.lat, pt.lon] : null))
              .filter(Boolean);
            reviewGeomCacheRef.current.set(p.id, coords);
          } catch { coords = []; }
        }
        if (cancelled || coords.length === 0) continue;
        const color = colorByPattern.get(p.id) || '#009BDB';
        const pl = L.polyline(coords, { color, weight: 4, opacity: 0.85 }).addTo(layers);
        allBounds.push(pl.getBounds());
      }
      if (cancelled) return;

      // Markers nas JUNÇÕES de trip↔deadhead:
      //   - 1ª trip: S (verde) no início
      //   - Trips intermédias: marker preto numerado no início E no fim
      //   - Última trip: marker preto numerado no início, E (vermelho) no fim
      // O número corresponde à ordem da trip (1-indexed).
      const orderedForMarkers = Array.from(selectedTripIds)
        .map(id => ({ id, ctx: tripContextMap.get(id) }))
        .filter(x => x.ctx && x.ctx.patternId != null)
        .sort((a, b) => String(a.ctx.firstDeparture || '').localeCompare(String(b.ctx.firstDeparture || '')));
      // Numeracao CRONOLOGICA dos pontos de passagem: S (inicio), 1 (fim
      // trip 1), 2 (inicio trip 2), 3 (fim trip 2), ..., E (fim ultima trip).
      // Cada salto entre trips e' representado por uma transicao N -> N+1 com
      // deadhead entre os 2 pontos.
      const N = orderedForMarkers.length;
      let pointNum = 0;
      for (let i = 0; i < N; i++) {
        const coords = reviewGeomCacheRef.current.get(orderedForMarkers[i].ctx.patternId);
        if (!coords || coords.length === 0) continue;
        const startPt = coords[0];
        const endPt = coords[coords.length - 1];

        // INICIO da trip: S na primeira, numero sequencial nas restantes.
        if (i === 0) {
          L.marker(startPt, {
            icon: L.divIcon({ className: 'bsm-fs-review-pin bsm-fs-review-pin--start', html: '<span>S</span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
            zIndexOffset: 1000,
          }).addTo(layers);
        } else {
          pointNum++;
          L.marker(startPt, {
            icon: L.divIcon({ className: 'bsm-fs-review-pin bsm-fs-review-pin--deadhead', html: `<span>${pointNum}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
            zIndexOffset: 900,
          }).addTo(layers);
        }

        // FIM da trip: E na ultima, numero sequencial nas restantes.
        if (i === N - 1) {
          L.marker(endPt, {
            icon: L.divIcon({ className: 'bsm-fs-review-pin bsm-fs-review-pin--end', html: '<span>E</span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
            zIndexOffset: 1000,
          }).addTo(layers);
        } else {
          pointNum++;
          L.marker(endPt, {
            icon: L.divIcon({ className: 'bsm-fs-review-pin bsm-fs-review-pin--deadhead', html: `<span>${pointNum}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
            zIndexOffset: 900,
          }).addTo(layers);
        }
      }

      // Conexoes entre trips consecutivas (deadhead): chama o OSRM (proxy
      // /api/v1/osrm/route) para obter a rota REAL pelas ruas entre o fim de
      // uma trip e o inicio da seguinte. Fallback para linha recta tracejada
      // se o OSRM nao responder.
      const orderedTrips = Array.from(selectedTripIds)
        .map(id => ({ id, ctx: tripContextMap.get(id) }))
        .filter(x => x.ctx && x.ctx.patternId != null)
        .sort((a, b) => String(a.ctx.firstDeparture || '').localeCompare(String(b.ctx.firstDeparture || '')));
      for (let i = 0; i < orderedTrips.length - 1; i++) {
        if (cancelled) return;
        const aCoords = reviewGeomCacheRef.current.get(orderedTrips[i].ctx.patternId);
        const bCoords = reviewGeomCacheRef.current.get(orderedTrips[i + 1].ctx.patternId);
        if (!aCoords || !bCoords || aCoords.length === 0 || bCoords.length === 0) continue;
        const endA = aCoords[aCoords.length - 1];
        const startB = bCoords[0];
        if (endA[0] === startB[0] && endA[1] === startB[1]) continue;

        let deadheadCoords = null;
        try {
          const r = await api.get('/osrm/route', {
            params: { lat1: endA[0], lon1: endA[1], lat2: startB[0], lon2: startB[1] },
          });
          const pts = r.data?.points;
          if (Array.isArray(pts) && pts.length >= 2) {
            deadheadCoords = pts
              .map(p => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' ? [p[0], p[1]] : null)
              .filter(Boolean);
          }
        } catch { /* fallback abaixo */ }

        const coords = (deadheadCoords && deadheadCoords.length >= 2) ? deadheadCoords : [endA, startB];
        if (cancelled) return;
        L.polyline(coords, {
          color: '#0f172a', weight: 3, opacity: 0.75, dashArray: '5 7',
        }).addTo(layers);
        // Os markers nas pontas do deadhead ja' foram desenhados no loop
        // anterior (markers numerados no inicio/fim de cada trip).
      }

      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0].pad(0));
        map.fitBounds(combined, { padding: [20, 20] });
      }
    })();

    return () => { cancelled = true; };
  }, [reviewing, reviewPatterns, selectedTripIds, tripContextMap]);

  // ─── Trips: helpers de elegibilidade e sobreposicao ──────────────────────
  const todayISO = useMemo(() => todayLisbonISO(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const isToday = serviceDate === todayISO;
  const nowSec = useMemo(() => nowLisbonSecondsOfDay(), [open, serviceDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const isTripPast = (trip) => {
    if (!isToday) return false;
    const dep = hmsToSeconds(trip.firstDeparture);
    if (dep == null) return false;
    return dep <= nowSec;
  };

  const eligibleTrips = useMemo(() => trips.filter(t => !isTripPast(t)), [trips, isToday, nowSec]);

  // Periodo do dia (manha 04-11, tarde 12-17, noite 18-03). All passa tudo.
  const tripPeriod = (tr) => {
    const dep = hmsToSeconds(tr.firstDeparture);
    if (dep == null) return 'all';
    const h = Math.floor(dep / 3600) % 24;
    if (h >= 4 && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'afternoon';
    return 'evening';
  };
  const visibleTrips = useMemo(() => {
    if (periodFilter === 'all') return trips;
    return trips.filter(tr => tripPeriod(tr) === periodFilter);
  }, [trips, periodFilter]);

  // Intervalos GLOBAIS de todas as trips selecionadas (atravessa padroes).
  // Usa o tripContextMap para nao depender da lista visivel actual.
  const selectedRanges = useMemo(() => {
    const arr = [];
    for (const id of selectedTripIds) {
      const ctx = tripContextMap.get(id);
      if (!ctx) continue;
      const start = hmsToSeconds(ctx.firstDeparture);
      const end = hmsToSeconds(ctx.lastArrival);
      if (start != null && end != null) arr.push([start, end, id]);
    }
    return arr;
  }, [selectedTripIds, tripContextMap]);

  const overlapsWithSelected = (tr) => {
    const start = hmsToSeconds(tr.firstDeparture);
    const end = hmsToSeconds(tr.lastArrival);
    if (start == null || end == null) return false;
    return selectedRanges.some(([s, e, id]) => id !== tr.id && start < e && s < end);
  };

  const toggleTrip = (id) => {
    setSelectedTripIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      const tr = trips.find(t => t.id === id);
      if (tr) {
        const start = hmsToSeconds(tr.firstDeparture);
        const end = hmsToSeconds(tr.lastArrival);
        if (start != null && end != null) {
          for (const sel of trips) {
            if (!next.has(sel.id)) continue;
            const s = hmsToSeconds(sel.firstDeparture);
            const e = hmsToSeconds(sel.lastArrival);
            if (s != null && e != null && start < e && s < end) return prev;
          }
        }
      }
      next.add(id);
      return next;
    });
  };

  // Select all greedy: salta sobreposicoes com escolhidas anteriores. Aplica
  // ao subconjunto VISIVEL (respeita o filtro de periodo) E elegivel (nao passou).
  const selectAll = () => {
    const chosen = [];
    const pool = visibleTrips.filter(t => !isTripPast(t));
    for (const tr of pool) {
      const start = hmsToSeconds(tr.firstDeparture);
      const end = hmsToSeconds(tr.lastArrival);
      if (start == null || end == null) continue;
      if (chosen.every(([s, e]) => !(start < e && s < end))) chosen.push([start, end, tr.id]);
    }
    setSelectedTripIds(new Set(chosen.map(c => c[2])));
  };
  const selectNone = () => setSelectedTripIds(new Set());

  // ─── Submit ──────────────────────────────────────────────────────────────
  // canSubmit deixa de depender de patternId (escalas multi-padrao).
  const canSubmit = !!serviceDate && selectedTripIds.size > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit || !bus) return;
    setSubmitting(true);
    try {
      // patternId omitido propositadamente: backend aceita escalas multi-padrao.
      const body = {
        serviceDate,
        tripIds: Array.from(selectedTripIds),
      };
      const res = await api.post(`/buses/${bus.id}/duties`, body);
      onCreated && onCreated(res.data || []);
      onClose && onClose();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || t('toasts.errorGeneric');
      onError && onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Derived UI ──────────────────────────────────────────────────────────
  const selectedPattern = patterns.find(p => String(p.id) === String(selectedPatternId)) || null;

  // Tempo total de servico = soma das duracoes das trips selecionadas.
  // Total GLOBAL (todos os padroes) a partir do tripContextMap.
  const totalServiceMinutes = useMemo(() => {
    let mins = 0;
    for (const id of selectedTripIds) {
      const ctx = tripContextMap.get(id);
      if (!ctx) continue;
      const s = hmsToSeconds(ctx.firstDeparture);
      const e = hmsToSeconds(ctx.lastArrival);
      if (s != null && e != null) {
        let d = Math.round((e - s) / 60);
        if (d < 0) d += 24 * 60;
        mins += d;
      }
    }
    return mins;
  }, [selectedTripIds, tripContextMap]);

  const totalServiceLabel = (() => {
    const h = Math.floor(totalServiceMinutes / 60);
    const m = totalServiceMinutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  })();

  if (!open) return null;

  // Step status derivado para o progress no header.
  const stepStatus = (idx) => {
    if (idx === 1) return selectedRouteId ? 'done' : 'active';
    if (idx === 2) return selectedPatternId ? 'done' : (selectedRouteId ? 'active' : 'idle');
    if (idx === 3) return (selectedPatternId && serviceDate) ? 'done' : (selectedPatternId ? 'active' : 'idle');
    if (idx === 4) return selectedTripIds.size > 0 ? 'done' : (selectedPatternId && serviceDate ? 'active' : 'idle');
    return 'idle';
  };

  return createPortal(
    <div className="bsm-fs" role="dialog" aria-modal="true" aria-labelledby="bsm-title">
        <header className="bsm-fs-header">
          <div className="bsm-fs-headtext">
            <h2 id="bsm-title">{t('pages.buses.scheduleModalTitle')}</h2>
            <p>{bus?.busCode ? t('pages.buses.scheduleModalForBus', { code: bus.busCode }) : ''}</p>
          </div>
          <button className="bsm-fs-close" onClick={onClose} aria-label={t('common.close')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div className="bsm-fs-grid">
          {/* ─── COLUNA 1 — decisoes ────────────────────────────────── */}
          <aside className="bsm-fs-panel bsm-fs-panel--decisions">

            {/* STEP 1 - Linha */}
            <section className="bsm-section">
              <header className="bsm-section-header">
                <span className="bsm-step bsm-step--num">1</span>
                <label htmlFor="bsm-route" className="bsm-label">
                  {t('pages.buses.stepLineLabel')}
                </label>
              </header>
              <select
                id="bsm-route"
                className="bsm-select"
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                disabled={loadingRoutes}
              >
                <option value="">{loadingRoutes ? t('common.loading') : t('pages.buses.stepLinePlaceholder')}</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.code ? `${r.code} · ${r.name || ''}` : (r.name || `#${r.id}`)}
                  </option>
                ))}
              </select>
            </section>

            {/* STEP 2 - Padrao (cards) */}
            {selectedRouteId && (
              <section className="bsm-section">
                <header className="bsm-section-header">
                  <span className="bsm-step bsm-step--num">2</span>
                  <label className="bsm-label">{t('pages.buses.stepPatternLabel')}</label>
                </header>
                {loadingPatterns ? (
                  <div className="bsm-loading">{t('common.loading')}</div>
                ) : patterns.length === 0 ? (
                  <div className="bsm-empty">{t('pages.buses.stepPatternEmpty')}</div>
                ) : (
                  <ul className="bsm-pattern-list" role="radiogroup" aria-label={t('pages.buses.stepPatternLabel')}>
                    {patterns.map(p => {
                      const isSel = String(p.id) === String(selectedPatternId);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={isSel}
                            className={`bsm-pattern-card${isSel ? ' bsm-pattern-card--active' : ''}`}
                            onClick={() => setSelectedPatternId(String(p.id))}
                          >
                            <div className="bsm-pattern-card-head">
                              <span className="bsm-pattern-direction">{directionLabel(p.directionId, t)}</span>
                              {p.tripCount != null && (
                                <span className="bsm-pattern-trips">
                                  {t('pages.buses.patternTripsCount', { count: p.tripCount })}
                                </span>
                              )}
                            </div>
                            <div className="bsm-pattern-name">{p.name || `#${p.id}`}</div>
                            {p.stopCount != null && (
                              <div className="bsm-pattern-meta">
                                {t('pages.buses.patternStopsCount', { count: p.stopCount })}
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            {/* STEP 3 - Data */}
            {selectedPatternId && (
              <section className="bsm-section">
                <header className="bsm-section-header">
                  <span className="bsm-step bsm-step--num">3</span>
                  <label htmlFor="bsm-date" className="bsm-label">
                    {t('pages.buses.stepDateLabel')}
                  </label>
                </header>
                <input
                  id="bsm-date"
                  type="date"
                  className="bsm-input"
                  value={serviceDate}
                  min={todayISO}
                  onChange={(e) => setServiceDate(e.target.value)}
                />
                {serviceDate && (
                  <div className="bsm-date-hint">{formatDateHuman(serviceDate, i18n.language)}</div>
                )}
              </section>
            )}
          </aside>

          {/* ─── COLUNA 2 — mapa GRANDE ─────────────────────────────── */}
          <main className="bsm-fs-panel bsm-fs-panel--map">
            <header className="bsm-section-header">
              <span className="bsm-step bsm-step--icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                  <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
                </svg>
              </span>
              <span className="bsm-label">{t('pages.buses.patternMapLabel')}</span>
              {selectedPattern && (
                <span className="bsm-fs-pattern-tag">
                  {directionLabel(selectedPattern.directionId, t)} · {selectedPattern.name || ''}
                </span>
              )}
            </header>
            <div className="bsm-fs-map-wrap">
              <div ref={mapDivRef} className="bsm-fs-map" />
              {!selectedPatternId && (
                <div className="bsm-fs-map-overlay">{t('pages.buses.patternMapEmpty')}</div>
              )}
              {selectedPatternId && loadingGeometry && (
                <div className="bsm-fs-map-overlay">{t('common.loading')}</div>
              )}
            </div>
            {selectedPattern && (
              <div className="bsm-map-legend">
                <span className="bsm-legend-item"><span className="bsm-legend-dot bsm-legend-dot--start"/> {t('pages.buses.patternStart')}</span>
                <span className="bsm-legend-item"><span className="bsm-legend-dot bsm-legend-dot--end"/> {t('pages.buses.patternEnd')}</span>
              </div>
            )}
          </main>

          {/* ─── COLUNA 3 — viagens ─────────────────────────────────── */}
          <aside className="bsm-fs-panel bsm-fs-panel--trips">
            <header className="bsm-section-header">
              <span className="bsm-step bsm-step--num">4</span>
              <label className="bsm-label">{t('pages.buses.stepTripsLabel')}</label>
            </header>

            {!selectedPatternId || !serviceDate ? (
              <div className="bsm-empty">{t('pages.buses.stepTripsWaiting')}</div>
            ) : loadingTrips ? (
              <div className="bsm-loading">{t('common.loading')}</div>
            ) : trips.length === 0 ? (
              <div className="bsm-empty">{t('pages.buses.stepTripsEmpty')}</div>
            ) : (
              <>
                <div className="bsm-fs-period" role="tablist" aria-label={t('pages.buses.periodAll')}>
                  {[
                    { k: 'all',       label: t('pages.buses.periodAll') },
                    { k: 'morning',   label: t('pages.buses.periodMorning') },
                    { k: 'afternoon', label: t('pages.buses.periodAfternoon') },
                    { k: 'evening',   label: t('pages.buses.periodEvening') },
                  ].map(p => (
                    <button
                      key={p.k}
                      type="button"
                      role="tab"
                      aria-selected={periodFilter === p.k}
                      className={`bsm-fs-period-btn${periodFilter === p.k ? ' is-active' : ''}`}
                      onClick={() => setPeriodFilter(p.k)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="bsm-bulk">
                  <button type="button" className="bsm-bulk-btn" onClick={selectAll} disabled={visibleTrips.filter(t => !isTripPast(t)).length === 0}>
                    {t('pages.buses.selectAll')}
                  </button>
                  <button type="button" className="bsm-bulk-btn" onClick={selectNone} disabled={selectedTripIds.size === 0}>
                    {t('pages.buses.selectNone')}
                  </button>
                  <span className="bsm-bulk-count">
                    {t('pages.buses.tripsSelected', { count: selectedTripIds.size, total: eligibleTrips.length })}
                  </span>
                </div>

                {isToday && trips.length > eligibleTrips.length && (
                  <div className="bsm-hint">
                    {t('pages.buses.tripsPastFiltered', { count: trips.length - eligibleTrips.length })}
                  </div>
                )}

                <ul className="bsm-trips bsm-trips--tall" role="listbox" aria-multiselectable="true">
                  {visibleTrips.map(tr => {
                    const past = isTripPast(tr);
                    const checked = selectedTripIds.has(tr.id);
                    const overlap = !checked && !past && overlapsWithSelected(tr);
                    const disabled = past || overlap;
                    const duration = formatDuration(tr.firstDeparture, tr.lastArrival);
                    return (
                      <li
                        key={tr.id}
                        className={`bsm-trip ${past ? 'bsm-trip--past' : ''} ${checked ? 'bsm-trip--checked' : ''} ${overlap ? 'bsm-trip--overlap' : ''}`}
                        title={overlap ? t('pages.buses.tripsOverlapTooltip') : ''}
                      >
                        <label className="bsm-trip-label">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTrip(tr.id)}
                            disabled={disabled}
                            aria-label={`${formatTime(tr.firstDeparture)} -> ${formatTime(tr.lastArrival)}`}
                          />
                          <span className="bsm-trip-time">{formatTime(tr.firstDeparture)}</span>
                          <span className="bsm-trip-arrow" aria-hidden="true">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                            </svg>
                          </span>
                          <span className="bsm-trip-time bsm-trip-time--end">{formatTime(tr.lastArrival)}</span>
                          <span className="bsm-trip-meta">
                            {duration && <span className="bsm-trip-duration">{duration}</span>}
                            <span className="bsm-trip-stops">
                              {t('pages.buses.patternStopsCount', { count: tr.stopCount ?? 0 })}
                            </span>
                          </span>
                          {past && <span className="bsm-trip-past-tag">{t('pages.buses.tripsPastTag')}</span>}
                          {overlap && <span className="bsm-trip-overlap-tag">{t('pages.buses.tripsOverlapTag')}</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>

              </>
            )}

            {/* Preview do horario em construcao (persistente). Aparece sempre
                que ha viagens selecionadas, mesmo entre mudancas de linha/padrao,
                para o utilizador nao perder a vista do que ja escolheu. */}
            {selectedTripIds.size > 0 && (() => {
              const selectedSorted = Array.from(selectedTripIds)
                .map(id => ({ id, ctx: tripContextMap.get(id) }))
                .filter(x => x.ctx)
                .sort((a, b) => String(a.ctx.firstDeparture || '').localeCompare(String(b.ctx.firstDeparture || '')));
              return (
                <section className="bsm-fs-preview">
                  <header className="bsm-fs-preview-header">
                    <span className="bsm-fs-preview-title">{t('pages.buses.previewTitle')}</span>
                    <span className="bsm-fs-preview-total">{totalServiceLabel}</span>
                  </header>
                  <ol className="bsm-fs-preview-list">
                    {selectedSorted.map(({ id, ctx }, i) => (
                      <li key={id} className="bsm-fs-preview-row">
                        <span className="bsm-fs-preview-idx">{i + 1}</span>
                        <span className="bsm-fs-preview-time">{formatTime(ctx.firstDeparture)}</span>
                        <span className="bsm-fs-preview-arrow" aria-hidden="true">→</span>
                        <span className="bsm-fs-preview-time bsm-fs-preview-time--end">{formatTime(ctx.lastArrival)}</span>
                        {ctx.routeCode && (
                          <span className="bsm-fs-preview-route">{ctx.routeCode}</span>
                        )}
                        <span className="bsm-fs-preview-pattern">
                          {directionLabel(ctx.directionId, t)}{ctx.patternName ? ` · ${ctx.patternName}` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })()}
          </aside>
        </div>

        <footer className="bsm-fs-footer">
          <div className="bsm-fs-summary">
            {selectedRouteId && (() => {
              const r = routes.find(x => String(x.id) === String(selectedRouteId));
              return r ? <span className="bsm-fs-chip"><strong>{t('pages.buses.stepLineLabel')}</strong> {r.code || ''} {r.name || ''}</span> : null;
            })()}
            {selectedPattern && (
              <span className="bsm-fs-chip"><strong>{t('pages.buses.stepPatternLabel')}</strong> {directionLabel(selectedPattern.directionId, t)} · {selectedPattern.name || ''}</span>
            )}
            {serviceDate && (
              <span className="bsm-fs-chip"><strong>{t('pages.buses.stepDateLabel')}</strong> {formatDateHuman(serviceDate, i18n.language)}</span>
            )}
            {selectedTripIds.size > 0 && (
              <span className="bsm-fs-chip bsm-fs-chip--strong">
                {t('pages.buses.tripsSelectedWithDuration', { count: selectedTripIds.size, total: eligibleTrips.length, duration: totalServiceLabel })}
              </span>
            )}
          </div>
          <div className="bsm-fs-actions">
            <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" onClick={() => setReviewing(true)} disabled={!canSubmit}>
              {t('pages.buses.reviewSchedule')}
            </button>
          </div>
        </footer>

        {/* ─── Vista de REVISAO (sobreposta ao grid) ─────────────────── */}
        {reviewing && (() => {
          const selectedSorted = Array.from(selectedTripIds)
            .map(id => ({ id, ctx: tripContextMap.get(id) }))
            .filter(x => x.ctx)
            .sort((a, b) => String(a.ctx.firstDeparture || '').localeCompare(String(b.ctx.firstDeparture || '')));
          return (
            <div className="bsm-fs-review">
              <div className="bsm-fs-review-card">
                <header className="bsm-fs-review-header">
                  <div>
                    <h3>{t('pages.buses.reviewTitle')}</h3>
                    <p>{t('pages.buses.reviewSubtitle', { bus: bus?.busCode || '', date: formatDateHuman(serviceDate, i18n.language) })}</p>
                  </div>
                  <div className="bsm-fs-review-totals">
                    <span><strong>{selectedTripIds.size}</strong> {t('pages.buses.reviewTripsLabel')}</span>
                    <span><strong>{totalServiceLabel}</strong> {t('pages.buses.reviewServiceLabel')}</span>
                  </div>
                </header>
                {/* Mapa da escala completa, polylines coloridos por padrao. */}
                {reviewPatterns.length > 0 && (
                  <div className="bsm-fs-review-map-wrap">
                    <div ref={reviewMapDivRef} className="bsm-fs-review-map" />
                  </div>
                )}
                {reviewPatterns.length > 0 && (
                  <div className="bsm-fs-review-legend">
                    {reviewPatterns.map(p => (
                      <span key={p.id} className="bsm-fs-review-legend-item">
                        <span className="bsm-fs-review-legend-swatch" style={{ background: p.color }} />
                        {p.routeCode && <span className="bsm-fs-review-legend-route">{p.routeCode}</span>}
                        <span className="bsm-fs-review-legend-name">
                          {directionLabel(p.directionId, t)}{p.patternName ? ` · ${p.patternName}` : ''}
                        </span>
                      </span>
                    ))}
                    {/* Legenda adicional para os caminhos de ligacao (deadhead). */}
                    {selectedTripIds.size > 1 && (
                      <span className="bsm-fs-review-legend-item">
                        <span className="bsm-fs-review-legend-swatch bsm-fs-review-legend-swatch--deadhead" />
                        <span className="bsm-fs-review-legend-name">
                          {t('pages.buses.reviewDeadheadLabel')}
                        </span>
                      </span>
                    )}
                  </div>
                )}

                <ol className="bsm-fs-review-list">
                  {selectedSorted.map(({ id, ctx }, i) => {
                    const color = reviewPatterns.find(p => p.id === ctx.patternId)?.color;
                    return (
                      <li key={id} className="bsm-fs-review-row">
                        <span className="bsm-fs-review-idx">{i + 1}</span>
                        <span className="bsm-fs-review-time">{formatTime(ctx.firstDeparture)}</span>
                        <span className="bsm-fs-review-arrow" aria-hidden="true">→</span>
                        <span className="bsm-fs-review-time bsm-fs-review-time--end">{formatTime(ctx.lastArrival)}</span>
                        {ctx.routeCode && (
                          <span
                            className="bsm-fs-review-route"
                            style={color ? { background: color } : undefined}
                          >
                            {ctx.routeCode}
                          </span>
                        )}
                        <span className="bsm-fs-review-pattern">
                          {directionLabel(ctx.directionId, t)}{ctx.patternName ? ` · ${ctx.patternName}` : ''}
                        </span>
                        <span className="bsm-fs-review-duration">{formatDuration(ctx.firstDeparture, ctx.lastArrival) || ''}</span>
                      </li>
                    );
                  })}
                </ol>
                <footer className="bsm-fs-review-actions">
                  <button className="btn btn-secondary" onClick={() => setReviewing(false)} disabled={submitting}>
                    {t('pages.buses.reviewBack')}
                  </button>
                  <button className="btn btn-primary" onClick={submit} disabled={submitting}>
                    {submitting ? t('pages.buses.createScheduleCreating') : t('pages.buses.reviewConfirm')}
                  </button>
                </footer>
              </div>
            </div>
          );
        })()}
    </div>,
    document.body
  );
}
