// Sprint 1 (F4): Horarios planeados (R.IVT.05) - vista so-de-leitura.
// Hierarquia Transmodel: Linha -> Padrao (trajeto) -> Viagem -> horas paragem-a-paragem.
// Reaproveita o fluxo ja provado em components/livemap/RoutesTab.jsx:
//   GET /routes                      -> lista de linhas
//   GET /routes/{id}/patterns        -> [{id, directionId, name, stopCount, tripCount}]
//   GET /patterns/{id}/trips         -> [{tripId, firstDeparture, lastArrival, stopCount}]
//   GET /schedules/trips/{id}/stops  -> [{stop_sequence, arrival_time, departure_time, stop_name, stop_code}]
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import Modal from '../components/Modal';
import './Schedules.css';
// Reaproveita os estilos do modal-mapa de padrao (.pattern-map-modal /
// .pattern-map-canvas) ja definidos em Routes.css. Os imports CSS no Vite sao
// globais e deduplicados, por is'so importamos aqui para a pagina ser
// auto-suficiente mesmo que Routes.jsx nunca monte nesta sessao.
import './Routes.css';

// "HH:MM:SS" (pode ter >24h no GTFS) -> "HH:MM"
function fmtTime(value) {
  if (!value) return '--:--';
  const parts = String(value).split(':');
  if (parts.length < 2) return value;
  return `${parts[0].padStart(2, '0')}:${parts[1]}`;
}

// Sort numerico natural por codigo: L2 < L10 < L11
function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

const dirLabel = (d, t) => (Number(d) === 1 ? t('pages.schedules.inbound') : t('pages.schedules.outbound'));
const dirClass = (d) => (Number(d) === 1 ? 'in' : 'out');

export default function Schedules() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // --- Linhas (rotas) ---
  const [routes, setRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(null);
  // Sprint 5 (follow-up): modal de criar/editar horário
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null); // null = create | {id, headsign, stops...}
  // Sprint 5 (follow-up): modal próprio de confirmação de apagar trip.
  // Substitui o window.confirm() nativo (estética inconsistente com o resto).
  const [confirmDelete, setConfirmDelete] = useState(null); // null | { trip }
  const [deletingTrip, setDeletingTrip] = useState(false);

  const openEditTrip = async (trip, e) => {
    e.stopPropagation();
    try {
      const r = await api.get(`/schedules/trips/${trip.tripId}/stops`);
      // r.data = [{ stop_sequence, arrival_time, ... }]
      const tripStops = (r.data || []).map(s => ({
        stopSequence: s.stop_sequence ?? s.stopSequence,
        arrivalTime: s.arrival_time ?? s.arrivalTime,
      }));
      setEditingTrip({
        id: trip.id ?? trip.tripId,
        headsign: trip.headsign || '',
        serviceId: trip.serviceId || 'WEEKDAY',
        stopTimes: tripStops,
      });
      setCreateOpen(true);
    } catch (err) {
      alert('Não foi possível carregar a trip: ' + (err.response?.data?.message || err.message));
    }
  };

  // --- Padroes da linha selecionada ---
  const [patterns, setPatterns] = useState([]);
  const [loadingPatterns, setLoadingPatterns] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState(null);

  // --- Viagens do padrao selecionado ---
  const [trips, setTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(false);

  // --- Viagem selecionada + horas paragem-a-paragem ---
  const [selectedTrip, setSelectedTrip] = useState(null); // { ...trip, seq }
  const [stops, setStops] = useState([]);
  const [loadingStops, setLoadingStops] = useState(false);

  // Carrega as linhas uma vez. Deep-link ?route=<code> auto-seleciona.
  useEffect(() => {
    api.get('/routes')
      .then(r => {
        const data = r.data || [];
        setRoutes(data);
        try {
          const code = new URLSearchParams(window.location.search).get('route');
          if (code) {
            const match = data.find(x => String(x.code) === code);
            if (match) selectRoute(match);
          }
        } catch { /* ignore */ }
      })
      .catch(() => setRoutes([]))
      .finally(() => setLoadingRoutes(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pesquisa de linhas: ranking codigo exacto > comeca-com > contem > nome contem.
  const filteredRoutes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return [...routes].sort((a, b) => naturalCompare(a.code, b.code));
    }
    return routes
      .map(r => {
        const code = (r.code || '').toLowerCase();
        const name = (r.name || '').toLowerCase();
        let rank = 99;
        if (code === q) rank = 0;
        else if (code.startsWith(q)) rank = 1;
        else if (code.includes(q)) rank = 2;
        else if (name.includes(q)) rank = 3;
        return { r, rank };
      })
      .filter(x => x.rank < 99)
      .sort((a, b) => a.rank - b.rank || naturalCompare(a.r.code, b.r.code))
      .map(x => x.r);
  }, [routes, search]);

  // Sprint 5 (follow-up): tripCountByRoute vem de /schedules/coverage e
  // permite distinguir "linhas com padrão" vs "linhas com horário (trips)".
  const [tripCountByRoute, setTripCountByRoute] = useState({});
  useEffect(() => {
    api.get('/schedules/coverage').then(r => {
      const m = {};
      (r.data || []).forEach(row => {
        // backend devolve route_id + trip_count
        m[row.route_id] = Number(row.trip_count) || 0;
      });
      setTripCountByRoute(m);
    }).catch(() => setTripCountByRoute({}));
  }, []);

  const summary = useMemo(() => {
    const withTrips = routes.filter(r => (tripCountByRoute[r.id] || 0) > 0).length;
    return { withPat: withTrips, without: routes.length - withTrips, total: routes.length };
  }, [routes, tripCountByRoute]);

  // Selecionar linha -> vai buscar os padroes; limpa padrao/viagem/paragens.
  const selectRoute = (route) => {
    setSelectedRoute(route);
    setSelectedPattern(null);
    setTrips([]);
    clearTrip();
    setLoadingPatterns(true);
    api.get(`/routes/${route.id}/patterns`)
      .then(r => setPatterns(r.data || []))
      .catch(() => setPatterns([]))
      .finally(() => setLoadingPatterns(false));
  };

  // Refresh trips de um pattern (extraído para re-uso após criar nova trip).
  const loadTripsForPattern = (patternId) => {
    if (!patternId) return;
    setLoadingTrips(true);
    api.get(`/patterns/${patternId}/trips`)
      .then(r => setTrips(r.data || []))
      .catch(() => setTrips([]))
      .finally(() => setLoadingTrips(false));
  };

  // Sprint 5 (follow-up): abrir modal próprio de confirmação (sem window.confirm).
  const deleteTrip = (trip, e) => {
    e.stopPropagation();
    setConfirmDelete({ trip });
  };

  const doDeleteTrip = async () => {
    if (!confirmDelete?.trip) return;
    const trip = confirmDelete.trip;
    setDeletingTrip(true);
    try {
      await api.delete(`/schedules/trips/${trip.id ?? trip.tripId}`);
      if (selectedTrip?.tripId === trip.tripId) clearTrip();
      setConfirmDelete(null);
      loadTripsForPattern(selectedPattern?.id);
    } catch (err) {
      alert('Não foi possível apagar: ' + (err.response?.data?.message || err.message));
    } finally {
      setDeletingTrip(false);
    }
  };

  // Selecionar padrao -> vai buscar as viagens (agregadas, ordenadas por partida).
  const selectPattern = (pattern) => {
    setSelectedPattern(pattern);
    clearTrip();
    loadTripsForPattern(pattern.id);
  };

  // Selecionar viagem -> timeline das paragens. `seq` = numero da viagem (1-based).
  const selectTrip = (trip, seq) => {
    setSelectedTrip({ ...trip, seq });
    setStops([]);
    setLoadingStops(true);
    api.get(`/schedules/trips/${encodeURIComponent(trip.tripId)}/stops`)
      .then(r => setStops(r.data || []))
      .catch(() => setStops([]))
      .finally(() => setLoadingStops(false));
  };

  const clearTrip = () => {
    setSelectedTrip(null);
    setStops([]);
    setLoadingStops(false);
  };

  const selectedPatternObj = useMemo(
    () => patterns.find(p => p.id === selectedPattern) || null,
    [patterns, selectedPattern]
  );

  // --- Modal com mapa do trajeto (reaproveita a abordagem de Routes.jsx) ---
  // patternModal guarda o padrao clicado + a linha-pai (code/color) para o
  // titulo e a cor da polyline. mapDivRef aponta para o container; patternMapRef
  // guarda a instancia Leaflet para a destruir ao fechar (evita leaks/re-init).
  const [patternModal, setPatternModal] = useState(null);
  const mapDivRef = useRef(null);
  const patternMapRef = useRef(null);

  const openPatternMap = (pattern, route) => setPatternModal({ pattern, route });
  const closePatternMap = () => setPatternModal(null);

  // Inicializa o mapa Leaflet quando o modal abre. Keyed no id do padrao: re-corre
  // se o utilizador abrir outro trajeto sem fechar o modal pelo meio. Desenha a
  // geometria (GET /patterns/{id}/geometry -> {points:[[lat,lon],...]}) na cor da
  // linha e as paragens (GET /patterns/{id}/stops, coords resolvidas via GET /stops).
  const patternMapId = patternModal?.pattern?.id;
  useEffect(() => {
    if (!patternMapId || !mapDivRef.current) return undefined;

    const routeColor = patternModal.route?.color || '#009BDB';

    const map = L.map(mapDivRef.current, { zoomControl: true });
    patternMapRef.current = map;
    map.setView([41.5454, -8.4265], 12); // Braga — fallback ate' ao fitBounds

    // CARTO Voyager (consistente com PatternEditor/Livemap), nao OSM cru.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
      detectRetina: true,
    }).addTo(map);

    // Gotcha: o container tem tamanho 0 enquanto o modal nao esta' visivel.
    const sizeTimer = setTimeout(() => map.invalidateSize(), 100);

    let cancelled = false;

    api.get(`/patterns/${patternMapId}/geometry`)
      .then(({ data }) => {
        if (cancelled) return;
        const points = data?.points || [];
        if (points.length >= 2) {
          const polyline = L.polyline(points, { color: routeColor, weight: 5, opacity: 0.9 }).addTo(map);
          const bounds = polyline.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
        }
        // Paragens: precisamos das coords (o endpoint /patterns/{id}/stops so' traz
        // stopId/stopName), por is'so resolvemos via GET /stops -> {id: [lat, lon]}.
        Promise.all([
          api.get(`/patterns/${patternMapId}/stops`).then(r => r.data || []).catch(() => []),
          api.get('/stops').then(r => r.data || []).catch(() => []),
        ]).then(([patternStops, allStops]) => {
          if (cancelled) return;
          const coordsById = {};
          allStops.forEach(s => {
            if (s.latitude != null && s.longitude != null) {
              coordsById[s.id] = [s.latitude, s.longitude];
            }
          });
          patternStops.forEach(s => {
            const coords = coordsById[s.stopId];
            if (!coords) return;
            L.circleMarker(coords, {
              radius: 4, color: '#fff', weight: 2, fillColor: routeColor, fillOpacity: 1,
            })
              .bindTooltip(s.stopName, { direction: 'top' })
              .addTo(map);
          });
        });
      })
      .catch(() => { /* sem geometria: o mapa fica no fallback de Braga */ });

    return () => {
      cancelled = true;
      clearTimeout(sizeTimer);
      map.remove();
      patternMapRef.current = null;
    };
  }, [patternMapId, patternModal]);

  return (
    <div className="sch-page">
      {/* Modal com o mapa do trajeto (geometria + paragens), igual a Routes.jsx. */}
      <Modal open={!!patternModal} onClose={closePatternMap}>
        {patternModal && (
          <div className="pattern-map-modal">
            <div className="pattern-map-modal-header">
              <h3 className="modal-title pattern-map-modal-title">
                <code style={{ color: patternModal.route?.color || 'var(--color-primary)' }}>
                  {patternModal.route?.code}
                </code>
                <span className={`sch-dir-badge sch-dir-badge--${dirClass(patternModal.pattern?.directionId)}`}>
                  {dirLabel(patternModal.pattern?.directionId, t)}
                </span>
                {patternModal.pattern?.name && (
                  <span className="pattern-map-modal-name">{patternModal.pattern.name}</span>
                )}
              </h3>
              <button
                type="button"
                className="pattern-map-modal-close"
                onClick={closePatternMap}
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                &#10005;
              </button>
            </div>
            <div ref={mapDivRef} className="pattern-map-canvas" />
          </div>
        )}
      </Modal>

      <div className="page-header">
        <div>
          <h1>{t('pages.schedules.title')}</h1>
          <p className="page-subtitle">{t('pages.schedules.subtitle')}</p>
        </div>
        <div className="sch-coverage">
          <div className="sch-coverage-item">
            <span className="sch-coverage-value">{summary.withPat}</span>
            <span className="sch-coverage-label">{t('pages.schedules.withSchedule')}</span>
          </div>
          <div className="sch-coverage-divider" aria-hidden="true" />
          <div className="sch-coverage-item">
            <span className="sch-coverage-value sch-coverage-value--muted">{summary.without}</span>
            <span className="sch-coverage-label">{t('pages.schedules.withoutSchedule')}</span>
          </div>
        </div>
      </div>

      {/* Sprint 5 (follow-up): modal de criar horário (trip + stop_times).
          Aberto via botão "Adicionar trip" no card do padrão. */}
      {/* Mount condicional: garante estado fresco a cada abertura
          (caso contrário, reabrir com o mesmo routeId não dispara o
          useEffect que carrega patterns, deixando o padrão vazio). */}
      {createOpen && (
        <CreateTripModal
          open
          onClose={() => { setCreateOpen(false); setEditingTrip(null); }}
          onCreated={() => {
            setCreateOpen(false);
            setEditingTrip(null);
            loadTripsForPattern(selectedPattern?.id);
          }}
          routes={routes}
          initialRouteId={selectedRoute?.id}
          initialPatternId={selectedPattern?.id}
          editingTrip={editingTrip}
          t={t}
        />
      )}

      {/* Modal de confirmação para apagar trip — usa o API standard do <Modal>
          (type=danger → ícone + botão consistentes com o resto do sistema). */}
      <Modal
        open={!!confirmDelete}
        onClose={() => !deletingTrip && setConfirmDelete(null)}
        onConfirm={doDeleteTrip}
        type="danger"
        title="Apagar horário"
        message={
          confirmDelete
            ? `Apagar a trip ${fmtTime(confirmDelete.trip.firstDeparture)} → ${fmtTime(confirmDelete.trip.lastArrival)}? Esta acção não pode ser desfeita.`
            : ''
        }
        confirmText={deletingTrip ? 'A apagar...' : 'Apagar trip'}
        cancelText="Cancelar"
      />

      <div className="sch-layout sch-layout--3">
        {/* Coluna 1: Linhas */}
        <aside className="sch-routes">
          <div className="search-bar sch-search">
            <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              placeholder={t('pages.schedules.searchRoute')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="sch-route-list-head">
            <span>{t('pages.schedules.lineCol')}</span>
            <span>{t('pages.schedules.patternsCol')}</span>
          </div>
          <div className="sch-route-list">
            {loadingRoutes ? (
              <div className="sch-loading">{t('common.loading')}</div>
            ) : filteredRoutes.length === 0 ? (
              <div className="sch-placeholder sch-placeholder--sm">
                <p>{t('pages.schedules.noLines')}</p>
              </div>
            ) : filteredRoutes.map(r => {
              const has = (r.patternCount || 0) > 0;
              return (
                <button
                  key={r.id}
                  className={`sch-route-item${selectedRoute?.id === r.id ? ' sch-route-item--active' : ''}`}
                  onClick={() => selectRoute(r)}
                  title={`${t('pages.schedules.lineCol')} ${r.code} - ${r.name}`}
                >
                  <span
                    className="sch-line-badge"
                    style={{ background: r.color || 'var(--color-primary)' }}
                  >
                    {r.code}
                  </span>
                  <span className="sch-route-name">{r.name}</span>
                  {has
                    ? (
                      <span className="sch-route-count" title={`${r.patternCount} ${t('pages.schedules.patternsCol').toLowerCase()}`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 12h4l3-9 4 18 3-9h4"/>
                        </svg>
                        {r.patternCount}
                      </span>
                    )
                    : <span className="sch-route-noseched">{t('pages.schedules.noSchedule')}</span>}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Coluna 2: Padroes + Viagens da linha selecionada */}
        <section className="sch-mid">
          {!selectedRoute ? (
            <div className="sch-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
              </svg>
              <p>{t('pages.schedules.selectRoute')}</p>
            </div>
          ) : (
            <>
              <div className="sch-trips-head">
                <h2>
                  <span
                    className="sch-route-code--lg"
                    style={{ background: selectedRoute.color || 'var(--color-primary)' }}
                  >
                    {selectedRoute.code}
                  </span>
                  {selectedRoute.name}
                </h2>
                <button
                  className="sch-view-route"
                  onClick={() => navigate(`/backoffice/routes?q=${encodeURIComponent(selectedRoute.code)}`)}
                  title={t('pages.schedules.viewRoute')}
                >
                  {t('pages.schedules.viewRoute')}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </button>
              </div>

              {/* Padroes (trajetos) da linha */}
              <div className="sch-section-label">{t('pages.schedules.patternsTitle')}</div>
              {loadingPatterns ? (
                <div className="sch-loading">{t('common.loading')}</div>
              ) : patterns.length === 0 ? (
                <div className="sch-placeholder sch-placeholder--sm">
                  <p>{t('pages.schedules.noPatterns')}</p>
                </div>
              ) : (
                <div className="sch-pattern-list">
                  {patterns.map(p => (
                    // role=button (em vez de <button>) para podermos aninhar o
                    // botao "ver no mapa" sem botao-dentro-de-botao (HTML invalido).
                    <div
                      key={p.id}
                      className={`sch-pattern-item${selectedPattern === p.id ? ' sch-pattern-item--active' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectPattern(p)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPattern(p); } }}
                      title={p.name || dirLabel(p.directionId, t)}
                    >
                      <span className={`sch-dir-badge sch-dir-badge--${dirClass(p.directionId)}`}>
                        {dirLabel(p.directionId, t)}
                      </span>
                      <span className="sch-pattern-name">
                        {p.name || t('pages.schedules.patternFallback', { dir: dirLabel(p.directionId, t) })}
                      </span>
                      <span className="sch-pattern-meta">
                        {p.stopCount} {t('pages.schedules.stops').toLowerCase()} {'·'} {p.tripCount} {t('pages.schedules.tripsCol').toLowerCase()}
                      </span>
                      {/* Ver trajeto no mapa. stopPropagation para nao disparar
                          tambem a selecao do padrao (carregar viagens). */}
                      <button
                        type="button"
                        className="sch-pattern-map-btn"
                        onClick={(e) => { e.stopPropagation(); openPatternMap(p, selectedRoute); }}
                        onKeyDown={(e) => e.stopPropagation()}
                        title={t('pages.schedules.viewOnMap')}
                        aria-label={t('pages.schedules.viewOnMap')}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                          <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Viagens do padrao selecionado */}
              {selectedPattern && (
                <>
                  <div className="sch-section-label sch-section-label--mt sch-section-label--with-action">
                    <span>
                      {t('pages.schedules.tripsTitle')}
                      {!loadingTrips && trips.length > 0 && (
                        <span className="sch-section-count">{trips.length}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="sch-add-trip-btn"
                      onClick={() => setCreateOpen(true)}
                      title="Adicionar trip a este padrão"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Adicionar trip
                    </button>
                  </div>
                  {loadingTrips ? (
                    <div className="sch-loading">{t('common.loading')}</div>
                  ) : trips.length === 0 ? (
                    <div className="sch-placeholder sch-placeholder--sm">
                      <p>{t('pages.schedules.noTrips')}</p>
                    </div>
                  ) : (
                    <div className="sch-trip-list">
                      {trips.map((tr, i) => {
                        const seq = i + 1;
                        const active = selectedTrip?.tripId === tr.tripId;
                        return (
                          <div
                            key={tr.tripId ?? i}
                            className={`sch-trip-card${active ? ' sch-trip-card--active' : ''}`}
                            onClick={() => selectTrip(tr, seq)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && selectTrip(tr, seq)}
                            title={`${t('pages.schedules.trip')} ${seq} (${tr.tripId})`}
                          >
                            <span className="sch-trip-seq">{t('pages.schedules.trip')} {seq}</span>
                            <span className="sch-trip-window">
                              <span className="sch-trip-t">{fmtTime(tr.firstDeparture)}</span>
                              <span className="sch-trip-arrow" aria-hidden="true">{'→'}</span>
                              <span className="sch-trip-t">{fmtTime(tr.lastArrival)}</span>
                            </span>
                            <span className="sch-trip-stopcount">
                              {tr.stopCount} {t('pages.schedules.stops').toLowerCase()}
                            </span>
                            <div className="sch-trip-actions">
                              <button
                                type="button"
                                className="sch-trip-edit"
                                onClick={(e) => openEditTrip(tr, e)}
                                title="Editar trip"
                                aria-label="Editar trip"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button
                                type="button"
                                className="sch-trip-delete"
                                onClick={(e) => deleteTrip(tr, e)}
                                title="Apagar trip"
                                aria-label="Apagar trip"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>

        {/* Coluna 3: Detalhe da viagem - timeline paragem-a-paragem */}
        <section className="sch-detail">
          {!selectedTrip ? (
            <div className="sch-placeholder">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="3" x2="12" y2="21"/><circle cx="12" cy="6" r="2"/><circle cx="12" cy="18" r="2"/>
              </svg>
              <p>{selectedPattern ? t('pages.schedules.selectTrip') : t('pages.schedules.selectPattern')}</p>
            </div>
          ) : (
            <>
              <div className="sch-detail-head">
                <span className="sch-detail-seq">{t('pages.schedules.trip')} {selectedTrip.seq}</span>
                <span className="sch-detail-window">
                  {fmtTime(selectedTrip.firstDeparture)} {'→'} {fmtTime(selectedTrip.lastArrival)}
                </span>
                {selectedPatternObj && (
                  <span className={`sch-dir-badge sch-dir-badge--${dirClass(selectedPatternObj.directionId)}`}>
                    {dirLabel(selectedPatternObj.directionId, t)}
                  </span>
                )}
              </div>

              {loadingStops ? (
                <div className="sch-loading">{t('common.loading')}</div>
              ) : stops.length === 0 ? (
                <div className="sch-placeholder sch-placeholder--sm">
                  <p>{t('pages.schedules.noStops')}</p>
                </div>
              ) : (
                <ol className="sch-timeline">
                  {stops.map((s, i) => (
                    <li key={s.stop_sequence ?? i} className="sch-timeline-stop">
                      <span className="sch-timeline-time">{fmtTime(s.departure_time || s.arrival_time)}</span>
                      <span className="sch-timeline-dot" aria-hidden="true" />
                      <span className="sch-timeline-name">
                        {s.stop_name}
                        {s.stop_code && <span className="sch-timeline-code">{s.stop_code}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Sprint 5 (follow-up): tela grande para criar trip + stop_times num pattern ────
function CreateTripModal({ open, onClose, onCreated, routes, t, initialRouteId, initialPatternId, editingTrip }) {
  const isEditing = !!editingTrip;
  const [routeId, setRouteId] = useState('');
  const [patterns, setPatterns] = useState([]);
  const [patternId, setPatternId] = useState('');
  const [patternStops, setPatternStops] = useState([]); // [{stopId, stopSequence, stopName, lat, lon}]
  const [patternGeometry, setPatternGeometry] = useState([]); // [[lat, lon], ...] real polyline
  const [headsign, setHeadsign] = useState('');
  const [serviceId, setServiceId] = useState('WEEKDAY');
  const [stopTimes, setStopTimes] = useState({}); // { stopSequence: 'HH:MM' }
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);
  const mapRef = useRef(null);
  const mapInstRef = useRef(null);
  const layerRef = useRef(null);
  // State (não ref) para que mudanças disparem re-render e o useEffect veja-as.
  const [pendingPatternId, setPendingPatternId] = useState(null);

  // Reset completo do form sempre que o modal abre.
  // Em modo edit, pré-popula headsign/serviceId e prepara stopTimes a aplicar
  // depois das paragens carregarem (no useEffect dedicado abaixo).
  useEffect(() => {
    if (!open) return;
    setPendingPatternId(initialPatternId ? String(initialPatternId) : null);
    setRouteId(initialRouteId ? String(initialRouteId) : '');
    setPatterns([]);
    setPatternId('');
    setPatternStops([]); setPatternGeometry([]);
    if (editingTrip) {
      setHeadsign(editingTrip.headsign || '');
      setServiceId(editingTrip.serviceId || 'WEEKDAY');
      // stopTimes aplicados no useEffect [patternStops, editingTrip]
      setStopTimes({});
    } else {
      setHeadsign(''); setServiceId('WEEKDAY');
      setStopTimes({});
    }
    setMsg(null); setSubmitting(false);
  }, [open, initialRouteId, initialPatternId, editingTrip]);

  // Em modo edit: quando as paragens do pattern carregarem, mapeia os horários
  // da trip a editar (stopSequence → HH:MM) para os inputs.
  useEffect(() => {
    if (!editingTrip || !patternStops.length) return;
    const map = {};
    (editingTrip.stopTimes || []).forEach(st => {
      const seq = st.stopSequence ?? st.stop_sequence;
      const arr = st.arrivalTime ?? st.arrival_time;
      if (seq != null && arr) {
        // arrivalTime pode vir "HH:MM:SS" — corta para HH:MM
        const parts = String(arr).split(':');
        map[seq] = `${parts[0].padStart(2, '0')}:${parts[1]}`;
      }
    });
    setStopTimes(map);
  }, [editingTrip, patternStops]);

  // Quando os patterns carregam E temos um pending, aplica.
  useEffect(() => {
    if (!pendingPatternId || patterns.length === 0) return;
    if (patterns.some(p => String(p.id) === String(pendingPatternId))) {
      setPatternId(String(pendingPatternId));
      setPendingPatternId(null);
    }
  }, [patterns, pendingPatternId]);

  // Carrega patterns quando routeId muda
  useEffect(() => {
    setPatternStops([]); setStopTimes({});
    if (!routeId) { setPatterns([]); return; }
    api.get(`/routes/${routeId}/patterns`)
      .then(r => setPatterns(r.data || []))
      .catch(() => setPatterns([]));
  }, [routeId]);

  // Carrega geometria real do pattern (polyline pela estrada) em paralelo
  useEffect(() => {
    setPatternGeometry([]);
    if (!patternId) return;
    api.get(`/patterns/${patternId}/geometry`)
      .then(r => setPatternGeometry(r.data?.points || []))
      .catch(() => setPatternGeometry([]));
  }, [patternId]);

  // Carrega paragens do pattern quando muda
  useEffect(() => {
    setPatternStops([]); setStopTimes({});
    if (!patternId) return;
    api.get(`/patterns/${patternId}/stops`)
      .then(async r => {
        let list = r.data || [];
        // Se o endpoint não devolve lat/lon (backend antigo), enriquece via /stops/{id}.
        const needsCoords = list.some(s => (s.lat ?? s.latitude) == null);
        if (needsCoords) {
          try {
            const stopsRes = await api.get('/stops');
            const map = new Map();
            (stopsRes.data || []).forEach(s => map.set(s.id, s));
            list = list.map(s => {
              const full = map.get(s.stopId);
              return full
                ? { ...s, lat: full.latitude, lon: full.longitude }
                : s;
            });
          } catch { /* ignore */ }
        }
        setPatternStops(list);
      })
      .catch(() => setPatternStops([]));
  }, [patternId]);

  // Init/cleanup mapa Leaflet — usa o mesmo basemap CARTO Voyager do Livemap.
  useEffect(() => {
    if (!open || !mapRef.current) return;
    if (mapInstRef.current) return;
    const map = L.map(mapRef.current, { attributionControl: false }).setView([41.5518, -8.4229], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      detectRetina: true,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapInstRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => {
      try { map.remove(); } catch {}
      mapInstRef.current = null; layerRef.current = null;
    };
  }, [open]);

  // Re-render polyline + paragens no mapa (mesmo padrão do Livemap)
  useEffect(() => {
    const layer = layerRef.current;
    const map = mapInstRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    setTimeout(() => map.invalidateSize(), 50);

    const stopCoords = [];

    // 1) Polyline real (segue as ruas) — vem do endpoint geometry com âncoras
    if (patternGeometry && patternGeometry.length >= 2) {
      layer.addLayer(L.polyline(patternGeometry, { color: '#009BDB', weight: 6, opacity: 0.85 }));
    }

    // 2) Markers das paragens por cima
    patternStops.forEach((s, i) => {
      const lat = s.lat ?? s.latitude;
      const lon = s.lon ?? s.longitude;
      if (lat == null || lon == null) return;
      stopCoords.push([lat, lon]);
      const isFirst = i === 0;
      const isLast = i === patternStops.length - 1;
      let opts;
      if (isFirst) {
        opts = { radius: 8, fillColor: '#10b981', color: '#fff', weight: 2.5, fillOpacity: 1 };
      } else if (isLast) {
        opts = { radius: 8, fillColor: '#ef4444', color: '#fff', weight: 2.5, fillOpacity: 1 };
      } else {
        opts = { radius: 5, fillColor: '#009BDB', color: '#fff', weight: 1.5, fillOpacity: 0.92, opacity: 0.85 };
      }
      const m = L.circleMarker([lat, lon], opts);
      m.bindTooltip(`#${s.stopSequence || s.sequence} ${s.stopName}`, { direction: 'top' });
      layer.addLayer(m);
    });

    // 3) Fit bounds — preferir geometria (mais larga), senão paragens
    const fitCoords = patternGeometry && patternGeometry.length >= 2 ? patternGeometry : stopCoords;
    if (fitCoords.length >= 2) {
      setTimeout(() => map.fitBounds(L.latLngBounds(fitCoords), { padding: [40, 40], maxZoom: 16 }), 100);
    } else if (fitCoords.length === 1) {
      setTimeout(() => map.setView(fitCoords[0], 14), 100);
    }
  }, [patternStops, patternGeometry]);

  const setTime = (seq, val) => setStopTimes(prev => ({ ...prev, [seq]: val }));

  // Validações live — TODAS as paragens têm de ter horário e ser crescente.
  // O erro de "sem horário" é silencioso (input required já marca a vermelho).
  // Só mostra mensagem inline para o erro de ordem (monotonia).
  const validation = (() => {
    if (!patternStops.length) return { ok: false, error: null };
    let lastSecs = -1;
    let allFilled = true;
    for (const ps of patternStops) {
      const seq = ps.stopSequence || ps.sequence;
      const t = stopTimes[seq];
      if (!t) { allFilled = false; continue; }
      const secs = hhmmToSecs(t);
      if (secs < lastSecs) {
        return { ok: false, error: `Paragem #${seq} (${ps.stopName}) tem horário anterior ao da paragem anterior.` };
      }
      lastSecs = secs;
    }
    return { ok: allFilled, error: null };
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validation.ok || submitting) return;
    setSubmitting(true); setMsg(null);
    try {
      const stopTimesPayload = patternStops.map(ps => {
        const seq = ps.stopSequence || ps.sequence;
        const t = stopTimes[seq];
        return { stopSequence: seq, arrivalTime: t, departureTime: t };
      });
      let res;
      if (isEditing) {
        res = await api.put(`/schedules/trips/${editingTrip.id}`, {
          headsign: headsign.trim(),
          serviceId,
          stopTimes: stopTimesPayload,
        });
        setMsg({ ok: true, text: `Actualizado · ${res.data?.stopTimes || 0} paragens` });
      } else {
        res = await api.post('/schedules/trips', {
          patternId: Number(patternId),
          headsign: headsign.trim(),
          serviceId,
          stopTimes: stopTimesPayload,
        });
        setMsg({ ok: true, text: `Criado · ${res.data?.stopTimes || 0} paragens · tripId=${res.data?.tripId}` });
      }
      onCreated && onCreated(res.data);
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.message || err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar horário' : t('pages.schedules.createTitle', 'Criar horário')}>
      <form onSubmit={handleSubmit} className="ct-form">
        <div className="ct-controls">
          <div className="ct-field">
            <span>Linha</span>
            <SearchCombo
              items={routes || []}
              value={routeId}
              onChange={setRouteId}
              getKey={(r) => r.id}
              getLabel={(r) => `${r.code} · ${r.name}`}
              getSearchText={(r) => `${r.code} ${r.name}`}
              placeholder="Procurar linha por código ou nome..."
              disabled={isEditing}
              required
            />
          </div>
          <div className="ct-field">
            <span>Padrão</span>
            <SearchCombo
              items={patterns}
              value={patternId}
              onChange={setPatternId}
              getKey={(p) => p.id}
              getLabel={(p) => `${p.name || `Trajeto #${p.id}`} · ${p.stopCount} paragens`}
              getSearchText={(p) => `${p.name || ''} ${p.stopCount}`}
              placeholder={routeId ? "Procurar padrão..." : "Escolhe linha primeiro"}
              disabled={!routeId || isEditing}
              required
            />
          </div>
          <label className="ct-field">
            <span>Headsign</span>
            <input value={headsign} onChange={(e) => setHeadsign(e.target.value)} placeholder="ex.: BOM JESUS" required />
          </label>
          <label className="ct-field">
            <span>Service ID</span>
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="WEEKDAY">WEEKDAY</option>
              <option value="SATURDAY">SATURDAY</option>
              <option value="SUNDAY">SUNDAY</option>
              <option value="HOLIDAY">HOLIDAY</option>
            </select>
          </label>
        </div>

        <div className="ct-body">
          <div className="ct-map" ref={mapRef} />
          <div className="ct-stops">
            <div className="ct-stops-head">
              <h4>Horários por paragem</h4>
              <p>Define a hora de chegada em cada uma das <strong>{patternStops.length} paragens</strong> do trajeto, por ordem.</p>
            </div>
            <ul className="ct-stops-list">
              {patternStops.map((s, i) => {
                const isFirst = i === 0;
                const isLast = i === patternStops.length - 1;
                const role = isFirst ? 'start' : isLast ? 'end' : 'mid';
                return (
                  <li key={s.stopSequence} className={`ct-stop ct-stop--${role}`}>
                    <span className="ct-stop-seq">#{s.stopSequence}</span>
                    <span className="ct-stop-name">{s.stopName}</span>
                    <input
                      type="time"
                      lang="pt-PT"
                      step="60"
                      value={stopTimes[s.stopSequence || s.sequence] || ''}
                      onChange={(e) => setTime(s.stopSequence || s.sequence, e.target.value)}
                      required
                      className="ct-stop-time"
                    />
                  </li>
                );
              })}
              {patternStops.length === 0 && (
                <li className="ct-stops-empty">Selecciona uma linha e padrão para ver as paragens.</li>
              )}
            </ul>
          </div>
        </div>

        {validation.error && (
          <p className="ct-msg ct-msg--err">{validation.error}</p>
        )}
        {msg && (
          <p className={`ct-msg ${msg.ok ? 'ct-msg--ok' : 'ct-msg--err'}`}>{msg.text}</p>
        )}
        <div className="ct-actions">
          <button type="button" className="ct-btn-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button type="submit" className="ct-btn-primary" disabled={submitting || !validation.ok}>
            {submitting
              ? (isEditing ? 'A guardar...' : 'A criar...')
              : (isEditing ? 'Guardar alterações' : 'Criar horário')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Combobox searchable genérico (linha, padrão, etc).
// Render-agnostic: aceita items + getKey + getLabel + getSearchText.
function SearchCombo({ items, value, onChange, getKey, getLabel, getSearchText, placeholder, disabled, required }) {
  const initial = value ? (items || []).find(i => String(getKey(i)) === String(value)) : null;
  const [query, setQuery] = useState(initial ? getLabel(initial) : '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Sync quando value muda externamente (ex.: reset ao mudar linha)
  useEffect(() => {
    if (!value) {
      setQuery('');
      setOpen(false);
      return;
    }
    const found = (items || []).find(i => String(getKey(i)) === String(value));
    if (found) setQuery(getLabel(found));
  }, [value, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const h = () => updatePos();
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', h);
    return () => {
      window.removeEventListener('scroll', h, true);
      window.removeEventListener('resize', h);
    };
  }, [open]);

  const filtered = (items || []).filter(i => {
    if (!query) return true;
    const txt = (getSearchText ? getSearchText(i) : getLabel(i)).toLowerCase();
    return txt.includes(query.toLowerCase());
  }).slice(0, 80);

  const pick = (i) => {
    setQuery(getLabel(i));
    onChange(String(getKey(i)));
    setOpen(false);
  };

  const onKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) pick(filtered[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="ct-combo" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        className="ct-combo-input"
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        required={required}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); onChange(''); setHighlight(0); }}
        onClick={() => !disabled && setOpen(true)}
        onKeyDown={onKey}
        autoComplete="off"
      />
      {value && !disabled && (
        <button
          type="button"
          className="ct-combo-clear"
          onClick={() => { setQuery(''); onChange(''); setOpen(true); }}
          title="Limpar"
          aria-label="Limpar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      )}
      {open && (
        <ul className="ct-combo-list" role="listbox"
            style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}>
          {filtered.length === 0 && (
            <li className="ct-combo-empty">Sem resultados para "{query}"</li>
          )}
          {filtered.map((i, idx) => (
            <li
              key={getKey(i)}
              role="option"
              className={`ct-combo-item ${idx === highlight ? 'is-highlight' : ''} ${String(getKey(i)) === String(value) ? 'is-selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              onMouseEnter={() => setHighlight(idx)}
            >
              {getLabel(i)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Helpers
function hhmmToSecs(hhmm) {
  if (!hhmm) return -1;
  const [h, m] = hhmm.split(':');
  return Number(h) * 3600 + Number(m) * 60;
}
function secsToHHMM(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function interpolateStopTimes(stops, times) {
  // Constrói uma lista [{stopSequence, t}] preenchendo gaps por interpolação linear
  // entre âncoras (paragens com tempo definido). Se só houver 1 âncora, replica.
  const anchors = stops
    .map((s, i) => ({ idx: i, seq: s.stopSequence, secs: hhmmToSecs(times[s.stopSequence]) }))
    .filter(a => a.secs >= 0);
  if (anchors.length === 0) return [];
  if (anchors.length === 1) {
    // Sem mais info: assume 2min por paragem após a âncora
    const base = anchors[0];
    return stops.map((s, i) => ({
      stopSequence: s.stopSequence,
      t: secsToHHMM(base.secs + (i - base.idx) * 120),
    }));
  }
  const out = [];
  for (let i = 0; i < stops.length; i++) {
    // âncoras à esquerda e à direita
    const left = [...anchors].reverse().find(a => a.idx <= i);
    const right = anchors.find(a => a.idx >= i);
    if (left && right && left.idx !== right.idx) {
      const ratio = (i - left.idx) / (right.idx - left.idx);
      const secs = Math.round(left.secs + (right.secs - left.secs) * ratio);
      out.push({ stopSequence: stops[i].stopSequence, t: secsToHHMM(secs) });
    } else if (left) {
      // extrapolação para a direita: assume 2min/paragem
      out.push({ stopSequence: stops[i].stopSequence, t: secsToHHMM(left.secs + (i - left.idx) * 120) });
    } else if (right) {
      // extrapolação para a esquerda
      out.push({ stopSequence: stops[i].stopSequence, t: secsToHHMM(right.secs - (right.idx - i) * 120) });
    }
  }
  return out;
}
