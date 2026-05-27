// Sprint 7 (chatbot IA): dashboard de monitorizacao do assistente IA.
// KPIs (queries, latencia, taxa erro) + tabelas (top tools, ultimas
// interacoes). CSS via var(--color-*) tokens para dark theme.

import { useEffect, useState } from 'react';
import api from '../services/api';
import './AiMonitoring.css';

export default function AiMonitoring() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    // api.baseURL ja' inclui /api/v1, por isso os paths aqui sao relativos.
    Promise.all([
      api.get('/ai/monitoring/stats'),
      api.get('/ai/monitoring/logs?size=50'),
    ])
      .then(([s, l]) => {
        setStats(s.data);
        setLogs(l.data.content);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Erro ao carregar dados de monitorização.');
      });
  }, []);

  if (error) {
    return (
      <div className="ai-monitoring">
        <h1>Monitorização IA</h1>
        <div className="ai-monitoring-loading">{error}</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="ai-monitoring">
        <h1>Monitorização IA</h1>
        <div className="ai-monitoring-loading">A carregar...</div>
      </div>
    );
  }

  return (
    <div className="ai-monitoring">
      <h1>Monitorização IA</h1>

      <section className="kpi-grid">
        <Kpi label="Interações 24h" value={stats.interactionsLast24h ?? 0} />
        <Kpi
          label="Latência média 24h"
          value={`${Math.round(stats.avgLatencyLast24h ?? 0)}ms`}
        />
        <Kpi label="Tools distintas" value={stats.topTools?.length ?? 0} />
        <Kpi label="Logs visíveis" value={logs.length} />
      </section>

      <section className="ai-monitoring-section">
        <h2>Tools mais usadas (últimas 24h)</h2>
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Invocações</th>
            </tr>
          </thead>
          <tbody>
            {stats.topTools?.length > 0 ? (
              stats.topTools.map((t) => (
                <tr key={t.name}>
                  <td>{t.name}</td>
                  <td>{t.count}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={2}>Sem dados.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="ai-monitoring-section">
        <h2>Últimas interações</h2>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Utilizador</th>
              <th>Pergunta</th>
              <th>Tools</th>
              <th>Latência</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.length > 0 ? (
              logs.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.createdAt).toLocaleString('pt-PT')}</td>
                  <td>{l.username}</td>
                  <td>{l.prompt?.length > 80 ? `${l.prompt.substring(0, 80)}...` : l.prompt}</td>
                  <td>{l.toolsCalled?.join(', ') || '-'}</td>
                  <td>{l.latencyMs}ms</td>
                  <td>
                    <span className={`status-${l.status.toLowerCase()}`}>{l.status}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6}>Sem interações ainda.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
