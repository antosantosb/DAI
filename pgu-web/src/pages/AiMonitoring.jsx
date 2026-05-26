import { useEffect, useState } from 'react';
import api from '../services/api';

export default function AiMonitoring() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/api/v1/ai/monitoring/stats'),
      api.get('/api/v1/ai/monitoring/logs?size=50')
    ]).then(([s, l]) => {
      setStats(s.data);
      setLogs(l.data.content);
    });
  }, []);

  if (!stats) return <div>A carregar...</div>;

  return (
    <div className="ai-monitoring">
      <h1>Monitorização IA</h1>

      <section className="kpi-grid">
        <Kpi label="Queries hoje" value={stats.queriesToday} />
        <Kpi label="Queries semana" value={stats.queriesThisWeek} />
        <Kpi label="Latência média" value={`${stats.avgLatencyMs}ms`} />
        <Kpi label="Taxa erro" value={`${(stats.errorRate * 100).toFixed(1)}%`} />
      </section>

      <h2>Tools Mais Usadas (últimos 7 dias)</h2>
      <table>
        <thead><tr><th>Tool</th><th>Invocações</th></tr></thead>
        <tbody>
          {stats.topTools.map(t => (
            <tr key={t.name}><td>{t.name}</td><td>{t.count}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Últimas Interações</h2>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th><th>Utilizador</th><th>Pergunta</th>
            <th>Tools</th><th>Latência</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id}>
              <td>{new Date(l.createdAt).toLocaleString('pt-PT')}</td>
              <td>{l.username}</td>
              <td>{l.prompt.substring(0, 80)}...</td>
              <td>{l.toolsCalled?.join(', ')}</td>
              <td>{l.latencyMs}ms</td>
              <td><span className={`status-${l.status.toLowerCase()}`}>{l.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value }) {
  return <div className="kpi"><span>{label}</span><strong>{value}</strong></div>;
}
