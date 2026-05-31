// Sprint 1 (F4): Calendário operacional (R.IVT.05).
// Grelha mensal (estilo Google Calendar) com heatmap por nº de viagens.
// Dados de service_calendar (GTFS calendar.txt) via /api/v1/calendar.
//
// Fase E (E-front-1): nova tab "Escalas" — agrupa as bus_duty do dia por bus
// (GET /api/v1/duties?date=YYYY-MM-DD), com date picker e deep-link para a
// pagina Buses (?q={busCode}).
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
import ScheduleMapPreview from '../components/ScheduleMapPreview';
import './Calendar.css';

function startOfMonth(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), 1);
  r.setHours(0, 0, 0, 0);
  return r;
}
function mondayOf(d) {
  const date = new Date(d);
  const dow = (date.getDay() + 6) % 7; // 0=Mon..6=Sun
  date.setDate(date.getDate() - dow);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayISO = () => toISO(new Date());

export default function Calendar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [byDate, setByDate] = useState({});
  const [hasData, setHasData] = useState(true);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false });
  const [mapModal, setMapModal] = useState({ open: false, busCode: '', duties: [] });

  // Fase E (E-front-1): tab + estado de "Escalas".
  const [tab, setTab] = useState('month'); // month | duties
  const [dutiesDate, setDutiesDate] = useState(() => todayISO());
  const [duties, setDuties] = useState([]);
  const [loadingDuties, setLoadingDuties] = useState(false);

  const locale = i18n.language === 'pt' ? 'pt-PT' : 'en-GB';

  // Grelha: da segunda da semana que contém o dia 1 até preencher 6 semanas
  const gridDays = useMemo(() => {
    const first = mondayOf(monthAnchor);
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [monthAnchor]);

  const range = useMemo(() => ({
    from: toISO(gridDays[0]),
    to: toISO(gridDays[gridDays.length - 1]),
  }), [gridDays]);

  useEffect(() => {
    setLoading(true);
    // Substitui o antigo /api/v1/calendar (GTFS calendar.txt) pela nova
    // agregacao /duties/summary, baseada nas escalas (bus_duty) que nos
    // criamos. Shape mantido: { hasData, days: [{ date, totalTrips, routeCount }] }.
    api.get('/duties/summary', { params: range })
      .then(r => {
        const map = {};
        (r.data?.days || []).forEach(d => { map[d.date] = d; });
        setByDate(map);
        setHasData(r.data?.hasData !== false);
      })
      .catch(() => { setByDate({}); })
      .finally(() => setLoading(false));
  }, [range]);

  // Máximo de viagens DENTRO do mês (para escala do heatmap)
  const maxTrips = useMemo(() => {
    let max = 0;
    for (const d of gridDays) {
      if (d.getMonth() !== monthAnchor.getMonth()) continue;
      const v = byDate[toISO(d)]?.totalTrips || 0;
      if (v > max) max = v;
    }
    return Math.max(1, max);
  }, [gridDays, byDate, monthAnchor]);

  // Resumo do mês
  const monthSummary = useMemo(() => {
    let trips = 0, activeDays = 0, maxRoutes = 0;
    for (const d of gridDays) {
      if (d.getMonth() !== monthAnchor.getMonth()) continue;
      const day = byDate[toISO(d)];
      if (day && day.totalTrips > 0) {
        trips += day.totalTrips;
        activeDays++;
        if (day.routeCount > maxRoutes) maxRoutes = day.routeCount;
      }
    }
    return { trips, activeDays, maxRoutes };
  }, [gridDays, byDate, monthAnchor]);

  const monthLabel = monthAnchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const weekdayNames = useMemo(() => {
    // Segunda → Domingo
    const base = mondayOf(new Date());
    return Array.from({ length: 7 }, (_, i) =>
      addDays(base, i).toLocaleDateString(locale, { weekday: 'short' }));
  }, [locale]);

  const heatLevel = (trips) => {
    if (!trips) return 0;
    const r = trips / maxTrips;
    if (r > 0.75) return 4;
    if (r > 0.5) return 3;
    if (r > 0.25) return 2;
    return 1;
  };

  const goMonth = (delta) =>
    setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + delta, 1));
  const goToday = () => setMonthAnchor(startOfMonth(new Date()));

  const openDay = (iso, day) => {
    if (!day || day.totalTrips === 0) return;
    setModal({
      open: true,
      title: new Date(iso + 'T00:00:00').toLocaleDateString(locale, {
        weekday: 'long', day: '2-digit', month: 'long',
      }),
      day,
    });
  };
  const closeModal = () => setModal({ open: false });

  // Fase E (E-front-1): carrega bus_duty para o dia seleccionado.
  useEffect(() => {
    if (tab !== 'duties') return;
    setLoadingDuties(true);
    api.get('/duties', { params: { date: dutiesDate } })
      .then(r => setDuties(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDuties([]))
      .finally(() => setLoadingDuties(false));
  }, [tab, dutiesDate]);

  // Agrupa duties por busCode (cliente-side), ordenadas por plannedStart.
  const dutiesByBus = useMemo(() => {
    const out = new Map();
    const sorted = [...duties].sort((a, b) => {
      const ta = a.plannedStart ? new Date(a.plannedStart).getTime() : 0;
      const tb = b.plannedStart ? new Date(b.plannedStart).getTime() : 0;
      return ta - tb;
    });
    for (const d of sorted) {
      const key = d.busCode || `#${d.busId}`;
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(d);
    }
    return out;
  }, [duties]);

  const formatPlannedTime = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString(locale, {
        timeZone: 'Europe/Lisbon',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch { return '—'; }
  };

  return (
    <div className="cal-page">
      <div className="page-header">
        <div>
          <h1>{t('pages.calendar.title')}</h1>
          <p className="page-subtitle">{t('pages.calendar.subtitle')}</p>
        </div>
      </div>

      {/* Fase E (E-front-1): tabs (Mes vs Escalas) */}
      <div className="cal-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'month'}
          className={`cal-tab ${tab === 'month' ? 'cal-tab--active' : ''}`}
          onClick={() => setTab('month')}
        >
          {t('pages.calendar.tabMonth')}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'duties'}
          className={`cal-tab ${tab === 'duties' ? 'cal-tab--active' : ''}`}
          onClick={() => setTab('duties')}
        >
          {t('pages.calendar.tabDuties')}
        </button>
      </div>

      {tab === 'duties' && (
        <div className="cal-card">
          <div className="cal-controls">
            <div className="cal-nav">
              <label htmlFor="cal-duties-date" className="cal-month-label" style={{ minWidth: 0 }}>
                {t('pages.calendar.dutiesDateLabel')}
              </label>
              <input
                id="cal-duties-date"
                type="date"
                className="cal-today-btn"
                value={dutiesDate}
                onChange={(e) => setDutiesDate(e.target.value)}
                style={{ minWidth: 150 }}
              />
              <button className="cal-today-btn" onClick={() => setDutiesDate(todayISO())}>
                {t('pages.calendar.today')}
              </button>
            </div>
            <div className="cal-summary">
              <div className="cal-summary-item">
                <span className="cal-summary-value">{dutiesByBus.size}</span>
                <span className="cal-summary-label">{t('pages.calendar.dutiesBusesCount')}</span>
              </div>
              <div className="cal-summary-divider" aria-hidden="true" />
              <div className="cal-summary-item">
                <span className="cal-summary-value">{duties.length}</span>
                <span className="cal-summary-label">{t('pages.calendar.dutiesTripsCount')}</span>
              </div>
            </div>
          </div>

          {loadingDuties ? (
            <div className="cal-duties-empty">{t('common.loading')}</div>
          ) : duties.length === 0 ? (
            <div className="cal-duties-empty">{t('pages.calendar.dutiesEmpty')}</div>
          ) : (
            <ul className="cal-duties-list">
              {[...dutiesByBus.entries()].map(([busCode, rows]) => (
                <li key={busCode} className="cal-duties-bus">
                  <header className="cal-duties-bus-head">
                    <button
                      className="cal-duties-bus-code"
                      onClick={() => navigate(`/backoffice/buses?q=${encodeURIComponent(busCode)}`)}
                      title={t('pages.calendar.dutiesOpenBus', { code: busCode })}
                    >
                      {busCode}
                    </button>
                    <span className="cal-duties-bus-meta">
                      {t('pages.calendar.dutiesTripsCountInline', { count: rows.length })}
                    </span>
                    <button
                      type="button"
                      className="cal-duties-bus-map"
                      onClick={() => setMapModal({ open: true, busCode, duties: rows })}
                      title={t('pages.calendar.dutiesViewMap')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                        <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
                      </svg>
                      {t('pages.calendar.dutiesViewMap')}
                    </button>
                  </header>
                  <ol className="cal-duties-rows">
                    {rows.map(d => (
                      <li key={d.id} className="cal-duties-row">
                        <span className="cal-duties-time">{formatPlannedTime(d.plannedStart)}</span>
                        <span className="cal-duties-route">{d.routeShortName || '—'}</span>
                        <span className="cal-duties-headsign" title={d.tripHeadsign || d.tripDisplayName || ''}>
                          {d.tripHeadsign || d.tripDisplayName || `trip #${d.tripId}`}
                        </span>
                        <span className={`cal-duties-status cal-duties-status--${d.status}`}>{d.status}</span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'month' && !hasData && !loading && (
        <div className="cal-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>
          </svg>
          <p className="cal-empty-title">{t('pages.calendar.noDataTitle')}</p>
          <p className="cal-empty-text">{t('pages.calendar.noDataText')}</p>
        </div>
      )}

      {tab === 'month' && hasData && (
        <div className="cal-card">
          {/* Barra de controlo */}
          <div className="cal-controls">
            <div className="cal-nav">
              <button className="cal-nav-btn" onClick={() => goMonth(-1)} aria-label={t('pages.calendar.prevMonth')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <h2 className="cal-month-label">{monthLabel}</h2>
              <button className="cal-nav-btn" onClick={() => goMonth(1)} aria-label={t('pages.calendar.nextMonth')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button className="cal-today-btn" onClick={goToday}>{t('pages.calendar.today')}</button>
            </div>

            {/* Resumo do mês */}
            <div className="cal-summary">
              <div className="cal-summary-item">
                <span className="cal-summary-value">{monthSummary.trips.toLocaleString(locale)}</span>
                <span className="cal-summary-label">{t('pages.calendar.totalTrips')}</span>
              </div>
              <div className="cal-summary-divider" aria-hidden="true" />
              <div className="cal-summary-item">
                <span className="cal-summary-value">{monthSummary.activeDays}</span>
                <span className="cal-summary-label">{t('pages.calendar.serviceDays')}</span>
              </div>
            </div>
          </div>

          {/* Cabeçalho dias da semana */}
          <div className="cal-weekdays">
            {weekdayNames.map((w, i) => (
              <div key={i} className={`cal-weekday${i >= 5 ? ' cal-weekday--weekend' : ''}`}>{w}</div>
            ))}
          </div>

          {/* Grelha */}
          {loading ? (
            <div className="cal-grid">
              {Array.from({ length: 42 }, (_, i) => (
                <div key={i} className="cal-cell cal-cell--skeleton" />
              ))}
            </div>
          ) : (
            <div className="cal-grid">
              {gridDays.map((d) => {
                const iso = toISO(d);
                const day = byDate[iso];
                const inMonth = d.getMonth() === monthAnchor.getMonth();
                const isToday = iso === todayISO();
                const trips = day?.totalTrips || 0;
                const level = heatLevel(trips);
                const weekend = (d.getDay() === 0 || d.getDay() === 6);
                return (
                  <button
                    key={iso}
                    className={[
                      'cal-cell',
                      !inMonth ? 'cal-cell--out' : '',
                      isToday ? 'cal-cell--today' : '',
                      weekend ? 'cal-cell--weekend' : '',
                      trips === 0 ? 'cal-cell--idle' : '',
                    ].filter(Boolean).join(' ')}
                    data-heat={level}
                    onClick={() => openDay(iso, day)}
                    disabled={trips === 0}
                    aria-label={`${iso}: ${trips} ${t('pages.calendar.trips')}, ${day?.routeCount || 0} ${t('pages.calendar.routesShort')}`}
                  >
                    <span className="cal-cell-num">{d.getDate()}</span>
                    {inMonth && trips > 0 && (
                      <span className="cal-cell-body">
                        <span className="cal-cell-trips">{trips.toLocaleString(locale)}</span>
                        <span className="cal-cell-routes">{day.routeCount} {t('pages.calendar.routesShort')}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Legenda heatmap */}
          <div className="cal-legend">
            <span className="cal-legend-label">{t('pages.calendar.fewer')}</span>
            {[0, 1, 2, 3, 4].map(l => (
              <span key={l} className="cal-legend-swatch" data-heat={l} />
            ))}
            <span className="cal-legend-label">{t('pages.calendar.more')}</span>
          </div>
        </div>
      )}

      {/* Detalhe do dia */}
      <Modal open={modal.open} onClose={closeModal} title={modal.title} type="info">
        {modal.day && (
          <div className="cal-modal">
            <div className="cal-modal-stats">
              <div className="cal-modal-stat">
                <span className="cal-modal-value">{modal.day.totalTrips.toLocaleString(locale)}</span>
                <span className="cal-modal-label">{t('pages.calendar.totalTrips')}</span>
              </div>
              <div className="cal-modal-stat">
                <span className="cal-modal-value">{modal.day.routeCount}</span>
                <span className="cal-modal-label">{t('pages.calendar.activeRoutes')}</span>
              </div>
            </div>
            {(modal.day.routeCodes || []).length > 0 && (
              <div className="cal-modal-routes">
                <span className="cal-modal-routes-label">
                  {t('pages.calendar.routesInService')}
                </span>
                <div className="cal-modal-chips">
                  {[...(modal.day.routeCodes || [])]
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                    .map(code => (
                      <button
                        key={code}
                        className="cal-chip"
                        onClick={() => {
                          closeModal();
                          // Agora os codes sao busCodes (e nao routeCodes do GTFS).
                          navigate(`/backoffice/buses?q=${encodeURIComponent(code)}`);
                        }}
                        title={t('pages.calendar.dutiesOpenBus', { code })}
                      >
                        {code}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: pre-visualizacao do trajeto + deadheads para um autocarro do dia. */}
      <Modal
        open={mapModal.open}
        onClose={() => setMapModal({ open: false, busCode: '', duties: [] })}
        title={t('pages.calendar.dutiesMapTitle', { code: mapModal.busCode })}
        type="info"
      >
        <ScheduleMapPreview duties={mapModal.duties} />
      </Modal>
    </div>
  );
}
