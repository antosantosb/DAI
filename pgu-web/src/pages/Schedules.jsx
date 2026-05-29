// Sprint 1 (F4): Horários planeados (R.IVT.05) — vista só-de-leitura.
// Master-detail: rotas (com cobertura) → trips da rota → modal com as horas.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
import './Schedules.css';

// "HH:MM:SS" (pode ter >24h no GTFS) → "HH:MM"
function fmtTime(t) {
  if (!t) return '—';
  const parts = String(t).split(':');
  if (parts.length < 2) return t;
  return `${parts[0].padStart(2, '0')}:${parts[1]}`;
}
const dirLabel = (d, t) => (Number(d) === 1 ? t('pages.schedules.inbound') : t('pages.schedules.outbound'));

export default function Schedules() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [coverage, setCoverage] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [trips, setTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [search, setSearch] = useState('');
  const [dirFilter, setDirFilter] = useState('all'); // all | 0 | 1
  const [modal, setModal] = useState({ open: false });

  useEffect(() => {
    api.get('/schedules/coverage')
      .then(r => {
        const data = r.data || [];
        setCoverage(data);
        // Sprint 1 (F4): deep-link do calendario — ?route=<code> auto-selecciona
        try {
          const code = new URLSearchParams(window.location.search).get('route');
          if (code) {
            const match = data.find(x => String(x.route_code) === code);
            if (match) selectRoute(match);
          }
        } catch { /* ignore */ }
      })
      .catch(() => setCoverage([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRoutes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coverage;
    // Ranking: código exacto > código começa-com > código contém > nome contém.
    // Dentro de cada nível, ordem numérica natural (2 < 12 < 20).
    return coverage
      .map(r => {
        const code = (r.route_code || '').toLowerCase();
        const name = (r.route_name || '').toLowerCase();
        let rank = 99;
        if (code === q) rank = 0;
        else if (code.startsWith(q)) rank = 1;
        else if (code.includes(q)) rank = 2;
        else if (name.includes(q)) rank = 3;
        return { r, rank };
      })
      .filter(x => x.rank < 99)
      .sort((a, b) =>
        a.rank - b.rank ||
        String(a.r.route_code).localeCompare(String(b.r.route_code), undefined, { numeric: true }))
      .map(x => x.r);
  }, [coverage, search]);

  const summary = useMemo(() => {
    const withSched = coverage.filter(r => (r.trip_count || 0) > 0).length;
    return { withSched, without: coverage.length - withSched, total: coverage.length };
  }, [coverage]);

  const selectRoute = (route) => {
    setSelectedRoute(route);
    setDirFilter('all');
    setLoadingTrips(true);
    api.get('/schedules/trips', { params: { routeId: route.route_id } })
      .then(r => setTrips(r.data || []))
      .catch(() => setTrips([]))
      .finally(() => setLoadingTrips(false));
  };

  const visibleTrips = useMemo(() => {
    if (dirFilter === 'all') return trips;
    return trips.filter(tr => String(tr.direction_id) === dirFilter);
  }, [trips, dirFilter]);

  const openTrip = (trip) => {
    setModal({ open: true, trip, stops: null, loading: true });
    api.get(`/schedules/trips/${encodeURIComponent(trip.trip_id)}/stops`)
      .then(r => setModal(m => m.open ? { ...m, stops: r.data || [], loading: false } : m))
      .catch(() => setModal(m => m.open ? { ...m, stops: [], loading: false } : m));
  };
  const closeModal = () => setModal({ open: false });

  return (
    <div className="sch-page">
      <div className="page-header">
        <div>
          <h1>{t('pages.schedules.title')}</h1>
          <p className="page-subtitle">{t('pages.schedules.subtitle')}</p>
        </div>
        <div className="sch-coverage">
          <div className="sch-coverage-item">
            <span className="sch-coverage-value">{summary.withSched}</span>
            <span className="sch-coverage-label">{t('pages.schedules.withSchedule')}</span>
          </div>
          <div className="sch-coverage-divider" aria-hidden="true" />
          <div className="sch-coverage-item">
            <span className="sch-coverage-value sch-coverage-value--muted">{summary.without}</span>
            <span className="sch-coverage-label">{t('pages.schedules.withoutSchedule')}</span>
          </div>
        </div>
      </div>

      <div className="sch-layout">
        {/* Coluna de rotas */}
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
            <span>{t('pages.schedules.tripsCol')}</span>
          </div>
          <div className="sch-route-list">
            {filteredRoutes.map(r => {
              const has = (r.trip_count || 0) > 0;
              return (
                <button
                  key={r.route_id}
                  className={`sch-route-item${selectedRoute?.route_id === r.route_id ? ' sch-route-item--active' : ''}`}
                  onClick={() => selectRoute(r)}
                  title={`${t('pages.schedules.lineCol')} ${r.route_code} · ${r.route_name}`}
                >
                  <span
                    className="sch-line-badge"
                    style={{ background: r.route_color || 'var(--color-primary)' }}
                  >
                    {r.route_code}
                  </span>
                  <span className="sch-route-name">{r.route_name}</span>
                  {has
                    ? (
                      <span className="sch-route-count" title={`${r.trip_count} ${t('pages.schedules.tripsCol').toLowerCase()}`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>
                        </svg>
                        {r.trip_count}
                      </span>
                    )
                    : <span className="sch-route-noseched">{t('pages.schedules.noSchedule')}</span>}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Trips da rota seleccionada */}
        <section className="sch-trips">
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
                  <span className="sch-route-code sch-route-code--lg">{selectedRoute.route_code}</span>
                  {selectedRoute.route_name}
                  <button
                    className="sch-view-route"
                    onClick={() => navigate(`/backoffice/routes?q=${encodeURIComponent(selectedRoute.route_code)}`)}
                    title={t('pages.schedules.viewRoute')}
                  >
                    {t('pages.schedules.viewRoute')}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </button>
                </h2>
                {trips.length > 0 && (
                  <div className="sch-dir-filter" role="group">
                    {['all', '0', '1'].map(d => (
                      <button
                        key={d}
                        className={`btn btn-sm btn-filter btn-filter--sm${dirFilter === d ? ' btn-filter--active' : ''}`}
                        onClick={() => setDirFilter(d)}
                      >
                        {d === 'all' ? t('pages.schedules.allDirections') : dirLabel(d, t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {loadingTrips ? (
                <div className="sch-loading">{t('common.loading')}</div>
              ) : visibleTrips.length === 0 ? (
                <div className="sch-placeholder">
                  <p>{t('pages.schedules.noTrips')}</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('pages.schedules.trip')}</th>
                        <th>{t('pages.schedules.direction')}</th>
                        <th>{t('pages.schedules.firstDeparture')}</th>
                        <th>{t('pages.schedules.lastArrival')}</th>
                        <th>{t('pages.schedules.stops')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTrips.map(tr => (
                        <tr key={tr.trip_id} className="sch-trip-row" onClick={() => openTrip(tr)}>
                          <td><code className="sch-trip-id">{tr.trip_id}</code></td>
                          <td>
                            <span className={`sch-dir-badge sch-dir-badge--${Number(tr.direction_id) === 1 ? 'in' : 'out'}`}>
                              {dirLabel(tr.direction_id, t)}
                            </span>
                          </td>
                          <td className="sch-time">{fmtTime(tr.first_departure)}</td>
                          <td className="sch-time">{fmtTime(tr.last_arrival)}</td>
                          <td><span className="count-badge">{tr.stop_count}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Modal: horas da trip */}
      <Modal
        open={modal.open}
        onClose={closeModal}
        title={modal.trip ? `${selectedRoute?.route_code} · ${modal.trip.trip_id}` : ''}
        type="info"
      >
        {modal.open && (
          <div className="sch-modal">
            {modal.loading ? (
              <div className="sch-loading">{t('common.loading')}</div>
            ) : (modal.stops && modal.stops.length > 0) ? (
              <ol className="sch-timeline">
                {modal.stops.map((s, i) => (
                  <li key={i} className="sch-timeline-stop">
                    <span className="sch-timeline-time">{fmtTime(s.departure_time || s.arrival_time)}</span>
                    <span className="sch-timeline-dot" aria-hidden="true" />
                    <span className="sch-timeline-name">
                      {s.stop_name}
                      <span className="sch-timeline-code">{s.stop_code}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sch-placeholder">{t('pages.schedules.noStops')}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
