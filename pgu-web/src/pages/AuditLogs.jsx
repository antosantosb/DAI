import { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import './AuditLogs.css';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef(null);

  useEffect(() => {
    const fetchLogs = async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await api.get('/audit-logs', { signal: ctrl.signal });
        setLogs(res.data || []);
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          console.error('Error fetching audit logs', err);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
    const iv = setInterval(fetchLogs, 30_000);
    return () => { clearInterval(iv); abortRef.current?.abort(); };
  }, []);

  const formatDate = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
      + ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="audit-page">
      <div className="page-header">
        <div>
          <h1>Logs de Auditoria</h1>
          <p className="page-subtitle">Registo de operações realizadas no sistema</p>
        </div>
      </div>

      {loading ? (
        <p className="audit-loading">A carregar logs…</p>
      ) : logs.length === 0 ? (
        <p className="audit-empty">Sem registos de auditoria.</p>
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Utilizador</th>
                <th>Ação</th>
                <th>Recurso</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="audit-date">{formatDate(log.createdAt)}</td>
                  <td className="audit-user">{log.username}</td>
                  <td>{log.action}</td>
                  <td className="audit-resource">{log.className}.{log.method}()</td>
                  <td>
                    {log.success ? (
                      <span className="audit-badge audit-badge--ok">OK</span>
                    ) : (
                      <span className="audit-badge audit-badge--err" title={log.errorMsg}>
                        Erro
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
