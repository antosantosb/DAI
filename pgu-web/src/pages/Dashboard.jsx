import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import BusIcon from '../components/BusIcon';
import StatIcon from '../components/StatIcon';
import './Dashboard.css';

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ buses: 0, stops: 0, routes: 0, active: 0, stopping: 0, stopped: 0 });
  const [recentTelemetry, setRecentTelemetry] = useState([]);
  const [activeAlarms, setActiveAlarms] = useState([]);
  // Sprint 2 (estilo BRT): feed de atividade recente (read-only). 204 -> [].
  const [activity, setActivity] = useState([]);

  const load = useCallback(() => {
    Promise.all([
      api.get('/buses').catch(() => ({ data: [] })),
      api.get('/stops').catch(() => ({ data: [] })),
      api.get('/routes').catch(() => ({ data: [] })),
      api.get('/telemetry/latest').catch(() => ({ data: [] })),
      api.get('/ocorrencias?estado=ABERTA').catch(() => ({ data: [] })),
      api.get('/activity?limit=20').catch(() => ({ data: [] })),
    ]).then(([buses, stops, routes, telemetry, ocorrencias, activityRes]) => {
      const busData = buses.data || [];
      setStats({
        buses: busData.length,
        stops: stops.data?.length || 0,
        routes: routes.data?.length || 0,
        // Fase E: backend já não usa "ACTIVE"; estados válidos são
        // EM_SERVICO / STOPPING / STOPPED / DECOMMISSIONED. Mantemos
        // "ACTIVE" como fallback (legacy) para retrocompatibilidade.
        active: busData.filter(b => b.routeId && (b.status === 'EM_SERVICO' || b.status === 'STOPPING' || b.status === 'ACTIVE')).length,
        stopping: busData.filter(b => b.status === 'STOPPING').length,
        stopped: busData.filter(b => b.status === 'STOPPED').length,
      });
      const activeCodes = new Set(busData.filter(b => b.status === 'EM_SERVICO' || b.status === 'STOPPING' || b.status === 'ACTIVE').map(b => b.busCode));
      setRecentTelemetry((telemetry.data || []).filter(t => activeCodes.has(t.busId)).slice(0, 6));
      setActiveAlarms(ocorrencias.data || []);
      // 204 No Content -> activityRes.data === '' (axios). Normaliza para [].
      setActivity(Array.isArray(activityRes.data) ? activityRes.data : []);
    });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('pages.dashboard.title')}</h1>
          <p className="page-subtitle">{t('pages.dashboard.subtitleAlt')}</p>
        </div>
        <div className="dash-live">
          <span className="live-dot"></span>
          <span className="dash-live-text">{t('pages.dashboard.liveLabel')}</span>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon--primary"><StatIcon type="bus" /></div>
          <div className="stat-content">
            <span className="stat-number">{stats.buses}</span>
            <span className="stat-label">{t('pages.dashboard.totalBuses')}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--success"><StatIcon type="stop" /></div>
          <div className="stat-content">
            <span className="stat-number">{stats.stops}</span>
            <span className="stat-label">{t('pages.dashboard.totalStops')}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--warning"><StatIcon type="route" /></div>
          <div className="stat-content">
            <span className="stat-number">{stats.routes}</span>
            <span className="stat-label">{t('pages.dashboard.totalRoutes')}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--primary"><StatIcon type="active" /></div>
          <div className="stat-content">
            <span className="stat-number">{stats.active}</span>
            <span className="stat-label">{t('pages.dashboard.activeBuses')}</span>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>{t('pages.dashboard.fleetState')}</h3>
          </div>
          <div className="dash-panel-body">
            <div className="fleet-bars">
              <FleetBar label={t('pages.dashboard.fleetActives')} count={stats.active} total={stats.buses} color="var(--color-success)" />
              <FleetBar label={t('pages.dashboard.fleetStopped')} count={stats.stopped} total={stats.buses} color="var(--color-text-secondary)" />
            </div>
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>{t('pages.dashboard.activeAlarms')}</h3>
            {activeAlarms.some(a => a.prioridade === 'CRITICA') && (
              <span className="pulse-badge">{t('pages.dashboard.criticalBadge')}</span>
            )}
          </div>
          <div className="dash-panel-body">
            <div className="alarmes-widget">
              <div className="alarmes-status-row">
                <span>{t('pages.dashboard.openOcorrencias')}</span>
                <span className="alarmes-count-badge" style={{ color: activeAlarms.length > 0 ? 'var(--color-danger)' : undefined }}>{activeAlarms.length}</span>
              </div>
              <div className="alarmes-status-row">
                <span>{t('pages.dashboard.criticalAlarms')}</span>
                <span className="alarmes-count-badge" style={{ color: activeAlarms.filter(a => a.prioridade === 'CRITICA').length > 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                  {activeAlarms.filter(a => a.prioridade === 'CRITICA').length}
                </span>
              </div>
              <a href="/backoffice/ocorrencias" className="inline-link">
                {t('pages.dashboard.goToOcorrencias')}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>{t('pages.dashboard.activityTitle')}</h3>
            <span className="live-dot"></span>
          </div>
          <div className="dash-panel-body dash-panel-body--list activity-feed">
            {activity.length === 0 ? (
              <div className="dash-empty">{t('pages.dashboard.activityEmpty')}</div>
            ) : (
              activity.map((item, i) => (
                <div key={i} className="activity-row">
                  <div className={`activity-icon activity-icon--${(item.category || '').toLowerCase()}`}>
                    <ActivityIcon category={item.category} />
                  </div>
                  <div className="activity-info">
                    <div className="activity-title">{item.title}</div>
                    <div className="activity-meta">
                      {item.actor && <span className="activity-actor">{item.actor}</span>}
                      {item.actor && <span className="telemetry-sep">|</span>}
                      <span className="activity-time">{item.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>{t('pages.dashboard.recentTelemetry')}</h3>
            <span className="live-dot"></span>
          </div>
          <div className="dash-panel-body dash-panel-body--list">
            {recentTelemetry.length === 0 && (
              <div className="dash-empty">{t('pages.dashboard.noTelemetry')}</div>
            )}
            {recentTelemetry.map((tm, i) => (
              <div key={i} className="telemetry-row">
                <BusIcon status={tm.status === 'active' ? 'active' : 'at-stop'} />
                <div className="telemetry-info">
                  <div className="telemetry-bus">{tm.busId}</div>
                  <div className="telemetry-detail">
                    <span className="telemetry-speed">{tm.speed?.toFixed(0) || 0} km/h</span>
                    <span className="telemetry-sep">|</span>
                    <span className="telemetry-pax">{tm.passengers} pax</span>
                  </div>
                </div>
                <div className={`telemetry-status telemetry-status--${tm.status}`}>
                  {tm.status === 'active' ? t('pages.dashboard.trip') : t('pages.dashboard.atStop')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Sprint 2 (estilo BRT): icone SVG por categoria do activity feed.
// ALERTA = sino; OCORRENCIA = triangulo de aviso; AUDIT = documento/check.
function ActivityIcon({ category }) {
  const common = {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (String(category || '').toUpperCase()) {
    case 'ALERTA':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'OCORRENCIA':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'AUDIT':
    default:
      return (
        <svg {...common} aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M9 15l2 2 4-4" />
        </svg>
      );
  }
}

function FleetBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="fleet-bar-row">
      <div className="fleet-bar-label">
        <span>{label}</span>
        <span className="fleet-bar-count">{count}</span>
      </div>
      <div className="fleet-bar-track">
        <div className="fleet-bar-fill" style={{ width: `${pct}%`, background: color }}></div>
      </div>
    </div>
  );
}
