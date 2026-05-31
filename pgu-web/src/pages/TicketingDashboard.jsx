import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { createStompClient } from '../services/stompClient';
import './AnalyticsDashboard.css';
import './TicketingDashboard.css';

/**
 * Sprint 5 (3.3): dashboard de bilhetica.
 * KPIs e graficos sobre /api/v1/validations/stats + stream realtime via STOMP.
 */
export default function TicketingDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ total24h: 0, byHour: [], byLine: [], byChannel: [], byCategory: [], byZone: [] });
  const [recent, setRecent] = useState([]); // ultimas 20 validacoes (live)
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/validations/stats')
      .then(r => setStats(r.data || stats))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const client = createStompClient({
      onConnect: () => {
        client.subscribe('/topic/ticketing', msg => {
          try {
            const ev = JSON.parse(msg.body);
            setRecent(prev => [ev, ...prev].slice(0, 20));
          } catch { /* ignore */ }
        });
      },
    });
    client.activate();
    return () => client.deactivate();
  }, []);

  const maxByHour = Math.max(1, ...stats.byHour.map(h => Number(h.total) || 0));

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <h1>{t('pages.ticketing.title', 'Bilhetica')}</h1>
        <p className="analytics-subtitle">
          {t('pages.ticketing.subtitle', 'Procura por linha, canal e coroa (ultimas 24h).')}
        </p>
      </header>

      {loading && <p style={{ padding: '0 2rem' }}>{t('common.loading', 'A carregar...')}</p>}

      {/* KPIs */}
      <div className="analytics-kpis">
        <div className="kpi-card">
          <div className="kpi-label">{t('pages.ticketing.kpiTotal', 'Validacoes (24h)')}</div>
          <div className="kpi-value">{Number(stats.total24h).toLocaleString('pt-PT')}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('pages.ticketing.kpiChannels', 'Canais activos')}</div>
          <div className="kpi-value">{stats.byChannel.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('pages.ticketing.kpiLines', 'Linhas com procura')}</div>
          <div className="kpi-value">{stats.byLine.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{t('pages.ticketing.kpiCategories', 'Categorias')}</div>
          <div className="kpi-value">{stats.byCategory.length}</div>
        </div>
      </div>

      {/* Hora */}
      <section className="analytics-section">
        <h2>{t('pages.ticketing.byHour', 'Procura por hora')}</h2>
        <div className="ticket-bars" role="img" aria-label="Validacoes por hora">
          {Array.from({ length: 24 }, (_, h) => {
            const row = stats.byHour.find(r => Number(r.hour) === h);
            const total = row ? Number(row.total) : 0;
            const pct = (total / maxByHour) * 100;
            return (
              <div key={h} className="ticket-bar" title={`${h}h: ${total}`}>
                <div className="ticket-bar-fill" style={{ height: `${pct}%` }} />
                <div className="ticket-bar-label">{h}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Por linha + canal + categoria + coroa */}
      <div className="ticket-grid">
        <Card title={t('pages.ticketing.byLine', 'Top linhas (24h)')} rows={stats.byLine} labelKey="line" />
        <Card title={t('pages.ticketing.byChannel', 'Por canal')} rows={stats.byChannel} labelKey="channel" />
        <Card title={t('pages.ticketing.byCategory', 'Por categoria')} rows={stats.byCategory} labelKey="category" />
        <Card title={t('pages.ticketing.byZone', 'Por coroa')} rows={stats.byZone} labelKey="zone" formatLabel={z => `Coroa ${z}`} />
      </div>

      {/* Live feed */}
      <section className="analytics-section">
        <h2>{t('pages.ticketing.live', 'Validacoes em tempo real')}</h2>
        {recent.length === 0 ? (
          <p style={{ color: 'var(--color-text-light)' }}>{t('pages.ticketing.liveEmpty', 'Sem eventos recentes.')}</p>
        ) : (
          <table className="ticket-table">
            <thead>
              <tr>
                <th>{t('pages.ticketing.colTime', 'Hora')}</th>
                <th>{t('pages.ticketing.colBus', 'Bus')}</th>
                <th>{t('pages.ticketing.colLine', 'Linha')}</th>
                <th>{t('pages.ticketing.colChannel', 'Canal')}</th>
                <th>{t('pages.ticketing.colCategory', 'Categoria')}</th>
                <th>{t('pages.ticketing.colZone', 'Coroa')}</th>
                <th>{t('pages.ticketing.colTransfer', 'Transbordo')}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(ev => (
                <tr key={ev.eventId}>
                  <td>{ev.validatedAt?.slice(11, 19)}</td>
                  <td>{ev.busId || '—'}</td>
                  <td>{ev.routeId || '—'}</td>
                  <td>{ev.channel}</td>
                  <td>{ev.category}</td>
                  <td>{ev.coroa}</td>
                  <td>{ev.transfer ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Card({ title, rows, labelKey, formatLabel }) {
  const total = rows.reduce((s, r) => s + Number(r.total || 0), 0) || 1;
  return (
    <section className="analytics-section">
      <h2>{title}</h2>
      <ul className="ticket-list">
        {rows.length === 0 && <li style={{ color: 'var(--color-text-light)' }}>—</li>}
        {rows.map((r, i) => {
          const label = formatLabel ? formatLabel(r[labelKey]) : r[labelKey];
          const n = Number(r.total);
          const pct = (n / total) * 100;
          return (
            <li key={i}>
              <div className="ticket-list-row">
                <span className="ticket-list-label">{label}</span>
                <span className="ticket-list-count">{n}</span>
              </div>
              <div className="ticket-list-bar">
                <div className="ticket-list-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
