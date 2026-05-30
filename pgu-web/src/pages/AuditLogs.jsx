import { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Modal from '../components/Modal';
import './AuditLogs.css';

// Sprint 0 (F6 follow-up): mapeia as strings de @LogActivity (PT, vindas do
// backend) para keys i18n para suportar PT/EN. Se a action nao estiver no
// mapa (logs antigos / actions novas), mostra a string original.
const ACTION_KEY_MAP = {
  'Criar autocarro': 'createBus',
  'Criar autocarros em batch': 'createBusesBatch',
  'Atualizar autocarro': 'updateBus',
  'Eliminar autocarro': 'deleteBus',
  'Criar paragem': 'createStop',
  'Atualizar paragem': 'updateStop',
  'Eliminar paragem': 'deleteStop',
  'Criar fonte de dados': 'createDataSource',
  'Atualizar fonte de dados': 'updateDataSource',
  'Remover fonte de dados': 'removeDataSource',
  'Reportar problema na fonte de dados': 'reportDataSource',
  'Submeter exportação de telemetria': 'submitTelemetryExport',
  'Submeter exportação de logs': 'submitLogsExport',
  'Eliminar exportação': 'deleteExport',
  'Atualizar parâmetros globais': 'updateGlobalSettings',
  'Upload GTFS': 'gtfsUpload',
  'Sincronizar GTFS TUB': 'gtfsSyncTub',
  'Reverter importação GTFS': 'gtfsRevert',
  'Atualizar config GTFS': 'gtfsUpdateConfig',
  'Criar rota': 'createRoute',
  'Atualizar rota': 'updateRoute',
  'Eliminar rota': 'deleteRoute',
  'Criar segmento de rota': 'createRouteSegment',
  'Criar segmentos de rota (batch)': 'createRouteSegmentsBatch',
  'Atualizar segmento de rota': 'updateRouteSegment',
  'Criar utilizador': 'createUser',
  'Atualizar utilizador': 'updateUser',
  'Ativar/Desativar utilizador': 'toggleUser',
  'Eliminar utilizador': 'deleteUser',
  'Criar Ocorrência': 'createOcorrencia',
  'Assumir Ocorrência': 'assumeOcorrencia',
  'Registar Ação Corretiva': 'correctiveAction',
  'Fechar Ocorrência': 'closeOcorrencia',
  'Marcar Falso Positivo': 'markFalsePositive',
  // Acoes de despacho emitidas em SNAKE_UPPER pelo backend.
  MENSAGEM_ENVIADA: 'messageSent',
  MENSAGEM_ENTREGUE: 'messageDelivered',
  MENSAGEM_LIDA: 'messageRead',
  MENSAGEM_CANCELADA: 'messageCancelled',
};

// Converte uma string SNAKE_UPPER (ex.: "MENSAGEM_ENTREGUE") numa frase legivel
// com so' a 1ª letra maiuscula ("Mensagem entregue"). Tolera digitos e nº.
const isSnakeUpper = (s) => /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(s);
const humanizeSnake = (s) => {
  const lower = s.replace(/_/g, ' ').toLowerCase().trim();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

// Fallback final: title-case por palavra, preservando acrónimos ja' em maiusculas
// (ex.: "GTFS"). Usado quando a acao nao e' conhecida nem SNAKE_UPPER.
const titleCase = (s) =>
  s.replace(/\s+/g, ' ').trim().split(' ').map((w) =>
    w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ');

export default function AuditLogs() {
  const { t, i18n } = useTranslation();

  // Reverse-map: label traduzido (PT ou EN, qualquer idioma carregado) -> slug.
  // Permite normalizar acoes que o backend ja' envia em frase (ex.: "Update bus",
  // "Sincronizar GTFS TUB") em vez da string PT canonica do ACTION_KEY_MAP.
  const valueToSlug = useMemo(() => {
    const map = {};
    for (const lng of i18n.languages || [i18n.language]) {
      const bundle = i18n.getResourceBundle(lng, 'translation');
      const actions = bundle?.pages?.auditLogs?.actionMap;
      if (actions) {
        for (const [slug, label] of Object.entries(actions)) {
          if (typeof label === 'string') map[label.toLowerCase()] = slug;
        }
      }
    }
    return map;
  }, [i18n, i18n.language]);

  // Normalizacao para APRESENTACAO (nao toca nos dados do backend):
  //  1. acao PT canonica conhecida -> label i18n;
  //  2. acao ja' em frase noutro idioma (reverse-map) -> label i18n do idioma atual;
  //  3. SNAKE_UPPER -> frase legivel ("MENSAGEM_ENTREGUE" -> "Mensagem entregue");
  //  4. fallback -> title-case da string original.
  const translateAction = (action) => {
    if (!action) return '—';
    const slug = ACTION_KEY_MAP[action] || valueToSlug[action.toLowerCase()];
    if (slug) return t(`pages.auditLogs.actionMap.${slug}`);
    if (isSnakeUpper(action)) return humanizeSnake(action);
    return titleCase(action);
  };
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [detailLog, setDetailLog] = useState(null); // Sprint 1 follow-up: detalhe expandido
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

  /**
   * Sprint 1 follow-up: summary curto e human-readable.
   *  - apanha padrao Hibernate "[ERROR: ... Detail: ...]" e devolve so' a parte util
   *  - corta SQL/stacktrace
   *  - max 80 chars; alem disso usa ellipsis e o modal mostra o resto
   */
  const summarizeError = (msg) => {
    if (!msg) return null;
    let s = msg;
    // Padrao Postgres: [ERROR: chave ... viola constraint ... Detail: ...]
    const errMatch = s.match(/\[ERROR:\s*([^\]]+?)(?:\s+Detail:\s*([^\]]+?))?\]/i);
    if (errMatch) {
      s = errMatch[1].trim();
      if (errMatch[2]) s += ' · ' + errMatch[2].trim();
    } else {
      // Cortar SQL/stacktrace
      const cut = s.search(/;\s*SQL\s*\[|;\s*nested|\bat\s+\S+\(|\n\s*at\s/i);
      if (cut > 0) s = s.slice(0, cut);
    }
    s = s.replace(/\s+/g, ' ').trim();
    if (s.length > 80) s = s.slice(0, 80) + '…';
    return s;
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
          <h1>{t('pages.auditLogs.title')}</h1>
          <p className="page-subtitle">{t('pages.auditLogs.subtitleAlt')}</p>
        </div>
        {lastRefresh && (
          <div className="audit-refresh-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {t('pages.auditLogs.autoRefresh')}
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
            <div className="audit-stat-label">{t('pages.auditLogs.total')}</div>
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
            <div className="audit-stat-label">{t('pages.auditLogs.success')}</div>
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
            <div className="audit-stat-label">{t('pages.auditLogs.errors')}</div>
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
            <div className="audit-stat-label">{t('pages.auditLogs.users')}</div>
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
            placeholder={t('pages.auditLogs.searchFull')}
            value={search} onChange={e => setSearch(e.target.value)}
            aria-label={t('pages.auditLogs.ariaSearch')}
          />
        </div>
        <div className="audit-filters" role="group" aria-label={t('pages.auditLogs.ariaFilterGroup')}>
          {[
            { key: 'all', label: t('pages.auditLogs.filterAll'), count: logs.length },
            { key: 'success', label: t('pages.auditLogs.filterSuccess'), count: successCount },
            { key: 'error', label: t('pages.auditLogs.filterErrors'), count: errorCount },
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
          <div className="audit-empty-title">{t('pages.auditLogs.loading')}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="audit-empty-state">
          <div className="audit-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div className="audit-empty-title">
            {search ? t('pages.auditLogs.noResults') : logs.length === 0 ? t('pages.auditLogs.noLogs') : t('pages.auditLogs.noFilterMatch')}
          </div>
          <div className="audit-empty-text">
            {search ? t('pages.auditLogs.noResultsFor', { q: search }) : t('pages.auditLogs.logsAppear')}
          </div>
        </div>
      ) : (
        <>
          <div className="audit-results-info">
            {filtered.length === logs.length
              ? t('pages.auditLogs.recordCount', { count: logs.length })
              : t('pages.auditLogs.recordCountOf', { shown: filtered.length, total: logs.length })}
          </div>
          <div className="table-container">
            <table className="data-table" role="table">
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>{t('pages.auditLogs.thDate')}</th>
                  <th style={{ width: '12%' }}>{t('pages.auditLogs.thUser')}</th>
                  <th style={{ width: '18%' }}>{t('pages.auditLogs.thAction')}</th>
                  <th style={{ width: '22%' }}>{t('pages.auditLogs.thResource')}</th>
                  <th style={{ width: '8%' }}>{t('pages.auditLogs.thState')}</th>
                  <th>{t('pages.auditLogs.thDetails')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.id} className={!log.success ? 'audit-row--error' : ''}>
                    <td className="audit-cell-date">{formatDate(log.createdAt)}</td>
                    <td><span className="audit-user-badge">{log.username || '—'}</span></td>
                    <td><span className="audit-action-label">{translateAction(log.action)}</span></td>
                    <td className="audit-cell-resource">
                      <span className="audit-resource-class">{log.className || '—'}</span>
                      <span className="audit-resource-method">.{log.method || '—'}()</span>
                    </td>
                    <td>
                      <span className={`audit-status-badge ${log.success ? 'audit-status--ok' : 'audit-status--err'}`}>
                        <span className="audit-status-dot" />
                        {log.success ? t('pages.auditLogs.stateOk') : t('pages.auditLogs.stateErr')}
                      </span>
                    </td>
                    <td className="audit-cell-error">
                      {log.errorMsg ? (
                        <div className="audit-error-cell">
                          <span className="audit-error-summary">{summarizeError(log.errorMsg)}</span>
                          <button
                            type="button"
                            className="audit-error-more"
                            onClick={() => setDetailLog(log)}
                            aria-label={t('pages.auditLogs.viewDetail')}
                          >
                            {t('pages.auditLogs.viewDetail')}
                          </button>
                        </div>
                      ) : (
                        <span className="audit-error-empty">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Sprint 1 follow-up: modal de detalhe do erro */}
      <Modal
        open={!!detailLog}
        onClose={() => setDetailLog(null)}
        title={t('pages.auditLogs.detailTitle')}
        type="info"
      >
        {detailLog && (
          <div className="audit-detail">
            <dl className="audit-detail-meta">
              <div><dt>{t('pages.auditLogs.thDate')}</dt><dd>{formatDate(detailLog.createdAt)}</dd></div>
              <div><dt>{t('pages.auditLogs.thUser')}</dt><dd>{detailLog.username || '—'}</dd></div>
              <div><dt>{t('pages.auditLogs.thAction')}</dt><dd>{translateAction(detailLog.action)}</dd></div>
              <div>
                <dt>{t('pages.auditLogs.thResource')}</dt>
                <dd className="audit-detail-mono">{detailLog.className || '—'}.{detailLog.method || '—'}()</dd>
              </div>
            </dl>
            <div className="audit-detail-section">
              <span className="audit-detail-label">{t('pages.auditLogs.thDetails')}</span>
              <pre className="audit-detail-pre">{detailLog.errorMsg || '—'}</pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
