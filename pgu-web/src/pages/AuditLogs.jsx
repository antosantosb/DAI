import { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import './AuditLogs.css';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [lastRefresh, setLastRefresh] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const fetchLogs = async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await api.get('/audit-logs', { signal: ctrl.signal });
        setLogs(res.data || []);
        setLastRefresh(new Date());
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

  const successCount = logs.filter(l => l.success).length;
  const errorCount = logs.filter(l => !l.success).length;
  const uniqueUsers = new Set(logs.map(l => l.username).filter(Boolean)).size;

  const filtered = logs
    .filter(l => {
      if (filter === 'success') return l.success;
      if (filter === 'error') return !l.success;
      return true;
    })
    .filter(l => {
      if (!search) return true;
      const s = search.toLowerCase();
      return [l.username, l.action, l.method, l.className].some(f => (f || '').toLowerCase().includes(s));
    });

  /** Extrai a parte legível do erro, removendo SQL e stacktrace */
  const summarizeError = (msg) => {
    if (!msg) return '—';
    // Extrair "ERROR: ..." até ao primeiro "]" ou "Detail:"
    const errMatch = msg.match(/\[ERROR:\s*(.+?)(?:\]|$)/);
    const detailMatch = msg.match(/Detail:\s*(.+?)(?:\]|\[|$)/);
    if (errMatch) {
      let summary = errMatch[1].trim();
      if (detailMatch) summary += ' — ' + detailMatch[1].trim();
      return summary;
    }
    // Cortar antes de "; SQL [" ou "; nested"
    const cutIdx = msg.search(/;\s*SQL\s*\[|;\s*nested|;\s*\[insert|;\s*\[select|;\s*\[update|;\s*\[delete/i);
    if (cutIdx > 0) return msg.slice(0, cutIdx);
    // Se ainda for muito longo, cortar a 120 chars
    if (msg.length > 120) return msg.slice(0, 120) + '…';
    return msg;
  };

  const formatDate = (dt) => {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Logs de Auditoria</h1>
          <p className="page-subtitle">Registo de operações realizadas no sistema</p>
        </div>
        {lastRefresh && (
          <div className="audit-refresh-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Atualização automática a cada 30s
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="audit-stats">
        <div className="audit-stat-card">
          <div className="audit-stat-icon audit-stat-icon--total">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div className="audit-stat-content">
            <div className="audit-stat-value">{logs.length}</div>
            <div className="audit-stat-label">Total</div>
          </div>
        </div>
        <div className="audit-stat-card">
          <div className="audit-stat-icon audit-stat-icon--success">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div className="audit-stat-content">
            <div className="audit-stat-value">{successCount}</div>
            <div className="audit-stat-label">Sucesso</div>
          </div>
        </div>
        <div className="audit-stat-card">
          <div className="audit-stat-icon audit-stat-icon--error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className="audit-stat-content">
            <div className="audit-stat-value">{errorCount}</div>
            <div className="audit-stat-label">Erros</div>
          </div>
        </div>
        <div className="audit-stat-card">
          <div className="audit-stat-icon audit-stat-icon--users">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div className="audit-stat-content">
            <div className="audit-stat-value">{uniqueUsers}</div>
            <div className="audit-stat-label">Utilizadores</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="audit-toolbar">
        <div className="search-bar">
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            placeholder="Pesquisar por utilizador, ação, método ou recurso..."
            value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Pesquisar logs"
          />
        </div>
        <div className="audit-filters" role="group" aria-label="Filtrar por estado">
          {[
            { key: 'all', label: 'Todos', count: logs.length },
            { key: 'success', label: 'Sucesso', count: successCount },
            { key: 'error', label: 'Erros', count: errorCount },
          ].map(f => (
            <button key={f.key}
              className={`btn btn-filter${filter === f.key ? ' btn-filter--active' : ''}`}
              onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="audit-empty-state">
          <span className="audit-spinner" />
          <div className="audit-empty-title">A carregar logs...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="audit-empty-state">
          <div className="audit-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div className="audit-empty-title">
            {search ? 'Nenhum resultado encontrado' : logs.length === 0 ? 'Sem logs registados' : 'Nenhum log corresponde ao filtro'}
          </div>
          <div className="audit-empty-text">
            {search ? `Nenhum log corresponde a "${search}".` : 'Os logs de atividade aparecerão aqui automaticamente.'}
          </div>
        </div>
      ) : (
        <>
          <div className="audit-results-info">
            {filtered.length === logs.length
              ? `${logs.length} registos`
              : `${filtered.length} de ${logs.length} registos`}
          </div>
          <div className="table-container">
            <table className="data-table" role="table">
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Data</th>
                  <th style={{ width: '12%' }}>Utilizador</th>
                  <th style={{ width: '18%' }}>Ação</th>
                  <th style={{ width: '22%' }}>Recurso</th>
                  <th style={{ width: '8%' }}>Estado</th>
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.id} className={!log.success ? 'audit-row--error' : ''}>
                    <td className="audit-cell-date">{formatDate(log.createdAt)}</td>
                    <td><span className="audit-user-badge">{log.username || '—'}</span></td>
                    <td><span className="audit-action-label">{log.action || '—'}</span></td>
                    <td className="audit-cell-resource">
                      <span className="audit-resource-class">{log.className || '—'}</span>
                      <span className="audit-resource-method">.{log.method || '—'}()</span>
                    </td>
                    <td>
                      <span className={`audit-status-badge ${log.success ? 'audit-status--ok' : 'audit-status--err'}`}>
                        <span className="audit-status-dot" />
                        {log.success ? 'OK' : 'Erro'}
                      </span>
                    </td>
                    <td className="audit-cell-error" title={log.errorMsg || ''}>
                      {summarizeError(log.errorMsg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
