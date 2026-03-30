import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import BusIcon from '../components/BusIcon';
import StatIcon from '../components/StatIcon';
import './Dashboard.css';

export default function Dashboard() {
  const [stats, setStats] = useState({ buses: 0, stops: 0, routes: 0, active: 0, stopping: 0, stopped: 0 });
  const [recentTelemetry, setRecentTelemetry] = useState([]);

  const load = useCallback(() => {
    Promise.all([
      api.get('/buses').catch(() => ({ data: [] })),
      api.get('/stops').catch(() => ({ data: [] })),
      api.get('/routes').catch(() => ({ data: [] })),
      api.get('/telemetry/latest').catch(() => ({ data: [] })),
    ]).then(([buses, stops, routes, telemetry]) => {
      const busData = buses.data || [];
      setStats({
        buses: busData.length,
        stops: stops.data?.length || 0,
        routes: routes.data?.length || 0,
        active: busData.filter(b => b.routeId && (b.status === 'ACTIVE' || b.status === 'STOPPING')).length,
        stopping: busData.filter(b => b.status === 'STOPPING').length,
        stopped: busData.filter(b => b.status === 'STOPPED').length,
      });
      const activeCodes = new Set(busData.filter(b => b.status === 'ACTIVE' || b.status === 'STOPPING').map(b => b.busCode));
      setRecentTelemetry((telemetry.data || []).filter(t => activeCodes.has(t.busId)).slice(0, 6));
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
          <h1>Dashboard</h1>
          <p className="page-subtitle">Vista geral do sistema TUB</p>
        </div>
        <div className="dash-live">
          <span className="live-dot"></span>
          <span className="dash-live-text">Em tempo real</span>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon--primary"><StatIcon type="bus" /></div>
          <div className="stat-content">
            <span className="stat-number">{stats.buses}</span>
            <span className="stat-label">Autocarros</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--success"><StatIcon type="stop" /></div>
          <div className="stat-content">
            <span className="stat-number">{stats.stops}</span>
            <span className="stat-label">Paragens</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--warning"><StatIcon type="route" /></div>
          <div className="stat-content">
            <span className="stat-number">{stats.routes}</span>
            <span className="stat-label">Rotas</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--primary"><StatIcon type="active" /></div>
          <div className="stat-content">
            <span className="stat-number">{stats.active}</span>
            <span className="stat-label">Ativos</span>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>Estado da Frota</h3>
          </div>
          <div className="dash-panel-body">
            <div className="fleet-bars">
              <FleetBar label="Ativos" count={stats.active} total={stats.buses} color="var(--color-success)" />
              <FleetBar label="Parados" count={stats.stopped} total={stats.buses} color="#94a3b8" />
            </div>
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-header">
            <h3>Telemetria Recente</h3>
            <span className="live-dot"></span>
          </div>
          <div className="dash-panel-body dash-panel-body--list">
            {recentTelemetry.length === 0 && (
              <div className="dash-empty">Sem dados de telemetria</div>
            )}
            {recentTelemetry.map((t, i) => (
              <div key={i} className="telemetry-row">
                <BusIcon status={t.status === 'active' ? 'active' : 'at-stop'} />
                <div className="telemetry-info">
                  <div className="telemetry-bus">{t.busId}</div>
                  <div className="telemetry-detail">
                    <span className="telemetry-speed">{t.speed?.toFixed(0) || 0} km/h</span>
                    <span className="telemetry-sep">|</span>
                    <span className="telemetry-pax">{t.passengers} pax</span>
                  </div>
                </div>
                <div className={`telemetry-status telemetry-status--${t.status}`}>
                  {t.status === 'active' ? 'Viagem' : 'Paragem'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
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
