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

  const summary = useMemo(() => {
    const withPat = routes.filter(r => (r.patternCount || 0) > 0).length;
    return { withPat, without: routes.length - withPat, total: routes.length };
  }, [routes]);

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

  // Selecionar padrao -> vai buscar as viagens (agregadas, ordenadas por partida).
  const selectPattern = (pattern) => {
    setSelectedPattern(pattern);
    clearTrip();
    setLoadingTrips(true);
    api.get(`/patterns/${pattern.id}/trips`)
      .then(r => setTrips(r.data || []))
      .catch(() => setTrips([]))
      .finally(() => setLoadingTrips(false));
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
                  <div className="sch-section-label sch-section-label--mt">
                    {t('pages.schedules.tripsTitle')}
                    {!loadingTrips && trips.length > 0 && (
                      <span className="sch-section-count">{trips.length}</span>
                    )}
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
                          <button
                            key={tr.tripId ?? i}
                            className={`sch-trip-card${active ? ' sch-trip-card--active' : ''}`}
                            onClick={() => selectTrip(tr, seq)}
                            // Mantemos o gtfs trip_id apenas como tooltip tecnico.
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
                          </button>
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
