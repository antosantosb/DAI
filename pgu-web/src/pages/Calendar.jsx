// Sprint 1 (F4): Calendário operacional (R.IVT.05).
// Grelha mensal (estilo Google Calendar) com heatmap por nº de viagens.
// Dados de service_calendar (GTFS calendar.txt) via /api/v1/calendar.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
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
    api.get('/calendar', { params: range })
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

  return (
    <div className="cal-page">
      <div className="page-header">
        <div>
          <h1>{t('pages.calendar.title')}</h1>
          <p className="page-subtitle">{t('pages.calendar.subtitle')}</p>
        </div>
      </div>

      {!hasData && !loading && (
        <div className="cal-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>
          </svg>
          <p className="cal-empty-title">{t('pages.calendar.noDataTitle')}</p>
          <p className="cal-empty-text">{t('pages.calendar.noDataText')}</p>
        </div>
      )}

      {hasData && (
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
            {modal.day.routeCodes.length > 0 && (
              <div className="cal-modal-routes">
                <span className="cal-modal-routes-label">
                  {t('pages.calendar.routesInService')}
                </span>
                <div className="cal-modal-chips">
                  {[...modal.day.routeCodes]
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                    .map(code => (
                      <button
                        key={code}
                        className="cal-chip"
                        onClick={() => {
                          closeModal();
                          navigate(`/backoffice/schedules?route=${encodeURIComponent(code)}`);
                        }}
                        title={t('pages.calendar.openRoute', { code })}
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
    </div>
  );
}
