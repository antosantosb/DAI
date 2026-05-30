import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import Modal from '../Modal';
import { getBusDisplayStatus } from './constants';

// "HH:MM:SS" (pode exceder 24h no GTFS) -> "HH:MM". Igual ao helper de Schedules.jsx.
function fmtTime(value) {
  if (!value) return '—';
  const parts = String(value).split(':');
  if (parts.length < 2) return value;
  return `${parts[0].padStart(2, '0')}:${parts[1]}`;
}

// Sort numérico natural: L2 < L10 < L11
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// Sprint 1 (F2): cores dos pills de adherence (verde/amarelo/vermelho)
const ADHERENCE_COLORS = {
  green:  { bg: 'rgba(16, 185, 129, 0.15)', fg: '#10b981', label: 'A horas' },
  yellow: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#f59e0b', label: 'Ligeiro atraso' },
  red:    { bg: 'rgba(239, 68, 68, 0.15)',  fg: '#ef4444', label: 'Atrasada' },
};

export default function RoutesTab({
  routes,
  stops,
  buses,
  backendBuses,
  selectedRoute,
  onRouteClick,
  routeSearch,
  setRouteSearch,
  routeSort,
  setRouteSort,
  adherenceMap = {},
  // Feature "ver trajetos da rota": patterns (trajetos) da rota selecionada.
  patterns = [],
  patternsLoading = false,
  selectedPattern = null,
  onPatternClick,
  onPatternClear,
}) {
  const { t } = useTranslation();
  // Modal de horários do padrão selecionado (substitui a navegação ao backoffice).
  // `view`: 'trips' (lista de viagens) | 'trip' (detalhe de uma viagem com as paragens).
  // Drill-in dentro do MESMO modal — sem abrir um segundo <Modal> aninhado.
  const [scheduleModal, setScheduleModal] = useState({
    open: false,
    loading: false,
    trips: [],
    view: 'trips',
    trip: null,
    stops: [],
    stopsLoading: false,
  });

  // Estado inicial do modal (também usado para o reset ao fechar).
  const closedSchedule = {
    open: false,
    loading: false,
    trips: [],
    view: 'trips',
    trip: null,
    stops: [],
    stopsLoading: false,
  };

  // Abre o modal e vai buscar as viagens do padrão selecionado.
  function openSchedules() {
    if (!selectedPattern) return;
    setScheduleModal({ ...closedSchedule, open: true, loading: true });
    api.get(`/patterns/${selectedPattern}/trips`)
      .then(r => setScheduleModal(m => ({ ...m, open: true, loading: false, trips: r.data || [] })))
      .catch(() => setScheduleModal(m => ({ ...m, open: true, loading: false, trips: [] })));
  }

  // Drill-in: clicar numa viagem mostra as paragens (timeline). Mantém o modal aberto.
  function openTrip(trip) {
    setScheduleModal(m => ({ ...m, view: 'trip', trip, stops: [], stopsLoading: true }));
    api.get(`/schedules/trips/${encodeURIComponent(trip.tripId)}/stops`)
      .then(r => setScheduleModal(m =>
        m.open && m.view === 'trip' ? { ...m, stops: r.data || [], stopsLoading: false } : m))
      .catch(() => setScheduleModal(m =>
        m.open && m.view === 'trip' ? { ...m, stops: [], stopsLoading: false } : m));
  }

  // Voltar à lista de viagens, mantendo o modal aberto.
  function backToTrips() {
    setScheduleModal(m => ({ ...m, view: 'trips', trip: null, stops: [], stopsLoading: false }));
  }

  const busList = useMemo(() =>
    Object.values(buses).map(bus => {
      const backend = backendBuses[bus.busId];
      const displayStatus = getBusDisplayStatus(backend?.status, bus.status);
      return { ...bus, displayStatus };
    }),
    [buses, backendBuses]
  );

  const activeRouteIds = useMemo(() =>
    new Set(
      busList
        .filter(b => b.displayStatus !== 'deactivated')
        .map(b => backendBuses[b.busId]?.routeId)
        .filter(Boolean)
    ),
    [busList, backendBuses]
  );

  const filteredRoutes = useMemo(() => {
    let list = routes;
    if (routeSearch) {
      const q = routeSearch.toLowerCase();
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      // Rotas com autocarros ativos vêm sempre primeiro
      const aActive = activeRouteIds.has(a.id);
      const bActive = activeRouteIds.has(b.id);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      // Dentro de cada grupo, aplicar o sort escolhido
      if (routeSort === 'name') return a.name.localeCompare(b.name);
      if (routeSort === 'code') return naturalCompare(a.code, b.code);
      if (routeSort === 'stops') return (b.stops?.length || 0) - (a.stops?.length || 0);
      return a.name.localeCompare(b.name);
    });
  }, [routes, routeSearch, routeSort, activeRouteIds]);

  // Feature "ver trajetos": ao selecionar uma rota, colapsa a lista a essa
  // rota para o painel de padroes (Trajetos) ficar logo visivel por baixo.
  const displayedRoutes = selectedRoute
    ? routes.filter(r => r.id === selectedRoute)
    : filteredRoutes;

  return (
    <>
      <div className="livemap-stats">
        <div className="livemap-stat">
          <div className="livemap-stat-value">{routes.length}</div>
          <div className="livemap-stat-label">{t('livemap.statsTotalRoutes')}</div>
        </div>
        <div className="livemap-stat">
          <div className="livemap-stat-value">{stops.length}</div>
          <div className="livemap-stat-label">{t('livemap.statsTotalStops')}</div>
        </div>
      </div>

      <div className="livemap-toolbar">
        <div className="livemap-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input
            type="text"
            placeholder={t('livemap.searchRoute')}
            value={routeSearch}
            onChange={e => setRouteSearch(e.target.value)}
          />
          {routeSearch && (
            <button className="livemap-search-clear" onClick={() => setRouteSearch('')}>&times;</button>
          )}
        </div>
        <select
          className="livemap-sort"
          value={routeSort}
          onChange={e => setRouteSort(e.target.value)}
        >
          <option value="name">{t('livemap.filterByName')}</option>
          <option value="code">{t('livemap.filterByCode')}</option>
          <option value="stops">{t('livemap.filterByStops')}</option>
        </select>
      </div>

      {displayedRoutes.length === 0 ? (
        <div className="livemap-empty">
          {routeSearch ? t('livemap.noResultsFound') : t('livemap.noRouteRegistered')}
        </div>
      ) : (
        <div className="livemap-route-list">
          {displayedRoutes.map(route => {
            const isActive = activeRouteIds.has(route.id);
            const busCount = busList.filter(b => backendBuses[b.busId]?.routeId === route.id && b.displayStatus !== 'deactivated').length;
            return (
              <div
                key={route.id}
                className={`livemap-route-item ${selectedRoute === route.id ? 'selected' : ''} ${!isActive ? 'inactive' : ''}`}
                onClick={() => onRouteClick(route.id)}
              >
                <div className="livemap-route-color" style={{ background: route.color || '#009BDB' }} />
                <div className="livemap-route-info">
                  <span className="livemap-route-name">{route.name}</span>
                  <span className="livemap-route-code">{route.code}</span>
                </div>
                <div className="livemap-route-meta">
                  {/* Sprint 1 (F2): pill de adherence stoplight (R.IVT.06) */}
                  {isActive && adherenceMap[route.id] && (() => {
                    const a = adherenceMap[route.id];
                    const c = ADHERENCE_COLORS[a.color] || ADHERENCE_COLORS.green;
                    return (
                      <span
                        className="livemap-route-adherence"
                        style={{ background: c.bg, color: c.fg }}
                        title={`${c.label} · atraso médio ${a.avgDelayMin} min (${a.delayedCount}/${a.observations} obs)`}
                      >
                        <span className="livemap-route-adherence-dot" style={{ background: c.fg }} />
                        {a.avgDelayMin > 0 ? `${a.avgDelayMin}m` : 'OK'}
                      </span>
                    );
                  })()}
                  {isActive && <span className="livemap-route-bus-count">{busCount} {t('livemap.busCountSuffix')}</span>}
                  {!isActive && <span className="livemap-route-no-service">{t('livemap.noService')}</span>}
                  <span className="livemap-route-stops">{route.stops?.length || 0} {t('livemap.stopsSuffix')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Feature "ver trajetos da rota": painel de patterns da rota
          selecionada. Clicar num pattern realca-o no mapa. */}
      {selectedRoute && (
        <div className="livemap-patterns">
          <div className="livemap-patterns-header">
            <span className="livemap-patterns-title">{t('livemap.patterns.title')}</span>
            {/* Só mostra "Ver horários" quando há um padrão selecionado. */}
            {selectedPattern && (
              <button
                type="button"
                className="livemap-patterns-schedules"
                onClick={openSchedules}
              >
                {t('livemap.patterns.viewSchedules', 'Ver horários')}
              </button>
            )}
          </div>

          {patternsLoading ? (
            <div className="livemap-patterns-empty">{t('livemap.patterns.loading')}</div>
          ) : patterns.length === 0 ? (
            <div className="livemap-patterns-empty">{t('livemap.patterns.none')}</div>
          ) : (
            <div className="livemap-pattern-list">
              {patterns.map(p => {
                const dirLabel = p.directionId === 1
                  ? t('pages.schedules.inbound')
                  : t('pages.schedules.outbound');
                const dirClass = p.directionId === 1 ? 'inbound' : 'outbound';
                return (
                  <div
                    key={p.id}
                    className={`livemap-pattern-item ${selectedPattern === p.id ? 'selected' : ''}`}
                    onClick={() => onPatternClick(p.id)}
                  >
                    <span className={`livemap-pattern-dir livemap-pattern-dir--${dirClass}`}>
                      {dirLabel}
                    </span>
                    <div className="livemap-pattern-info">
                      {p.name && <span className="livemap-pattern-name">{p.name}</span>}
                      <span className="livemap-pattern-meta">
                        {p.stopCount} {t('livemap.patterns.stopsSuffix')} · {p.tripCount} {t('livemap.patterns.tripsSuffix')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selectedRoute && (
        <button className="livemap-btn-reset" onClick={() => onRouteClick(null)}>
          {t('livemap.showAllRoutes')}
        </button>
      )}

      {/* Modal de horários do padrão selecionado. Lê o padrão da prop `patterns`
          para o título e vai buscar as viagens ao backend. */}
      <Modal
        open={scheduleModal.open}
        onClose={() => setScheduleModal(closedSchedule)}
      >
        {(() => {
          const route = routes.find(r => r.id === selectedRoute);
          const pattern = patterns.find(p => p.id === selectedPattern);
          const dirClass = pattern?.directionId === 1 ? 'inbound' : 'outbound';
          const dirLabel = pattern?.directionId === 1
            ? t('pages.schedules.inbound')
            : t('pages.schedules.outbound');
          const total = scheduleModal.trips.length;
          const isTripView = scheduleModal.view === 'trip';
          const trip = scheduleModal.trip;
          return (
            <div className="livemap-sched-modal">
              {/* Botão de fecho (X) sempre visível no canto superior direito.
                  Reutiliza o mesmo reset de estado que o onClose do <Modal>. */}
              <button
                type="button"
                className="livemap-sched-close"
                onClick={() => setScheduleModal(closedSchedule)}
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <span aria-hidden="true">&times;</span>
              </button>
              <div className="livemap-sched-head">
                <div className="livemap-sched-titlerow">
                  {route?.code && <span className="livemap-sched-route">{route.code}</span>}
                  <span className={`livemap-pattern-dir livemap-pattern-dir--${dirClass}`}>
                    {dirLabel}
                  </span>
                  {pattern?.name && <span className="livemap-sched-pattern">{pattern.name}</span>}
                </div>
                {/* O contador de viagens só faz sentido na lista. */}
                {!isTripView && !scheduleModal.loading && (
                  <span className="livemap-sched-count">
                    {total} {t('livemap.patterns.tripsSuffix')}
                  </span>
                )}
              </div>

              {isTripView ? (
                /* ── Detalhe da viagem: timeline das paragens ── */
                <div className="livemap-trip-detail">
                  <div className="livemap-trip-bar">
                    <button
                      type="button"
                      className="livemap-trip-back"
                      onClick={backToTrips}
                    >
                      <span aria-hidden="true">&larr;</span> {t('common.back', 'Voltar')}
                    </button>
                    {trip && (
                      <span className="livemap-trip-label">
                        {t('livemap.patterns.departure', 'Partida')} {fmtTime(trip.firstDeparture)}
                      </span>
                    )}
                  </div>

                  {scheduleModal.stopsLoading ? (
                    <div className="livemap-sched-state">{t('livemap.patterns.loading')}</div>
                  ) : scheduleModal.stops.length === 0 ? (
                    <div className="livemap-sched-state">
                      {t('livemap.patterns.noStops', 'Sem paragens para esta viagem')}
                    </div>
                  ) : (
                    <ol className="livemap-trip-timeline">
                      {scheduleModal.stops.map((s, i) => (
                        <li key={s.stop_sequence ?? i} className="livemap-trip-stop">
                          <span className="livemap-trip-time">
                            {fmtTime(s.departure_time || s.arrival_time)}
                          </span>
                          <span className="livemap-trip-dot" aria-hidden="true" />
                          <span className="livemap-trip-name">
                            {s.stop_name}
                            {s.stop_code && <span className="livemap-trip-code">{s.stop_code}</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : scheduleModal.loading ? (
                <div className="livemap-sched-state">{t('livemap.patterns.loading')}</div>
              ) : total === 0 ? (
                <div className="livemap-sched-state">
                  {t('livemap.patterns.noSchedules', 'Sem horários para este padrão')}
                </div>
              ) : (
                <div className="livemap-sched-tablewrap">
                  <table className="livemap-sched-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t('livemap.patterns.departure', 'Partida')}</th>
                        <th>{t('livemap.patterns.arrival', 'Chegada')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleModal.trips.map((trip, i) => (
                        <tr
                          key={trip.tripId ?? i}
                          className="livemap-sched-row"
                          onClick={() => openTrip(trip)}
                          title={t('livemap.patterns.viewTripStops', 'Ver paragens da viagem')}
                        >
                          <td className="livemap-sched-idx">{i + 1}</td>
                          <td className="livemap-sched-time">{fmtTime(trip.firstDeparture)}</td>
                          <td className="livemap-sched-time">{fmtTime(trip.lastArrival)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </>
  );
}
