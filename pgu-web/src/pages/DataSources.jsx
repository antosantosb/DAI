// Sprint 0 (F4): Fontes de Dados — backoffice (R.ID.01-09).
// Layout: tabela tradicional bem feita (estilo Stripe Dashboard).

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../services/api';
import { createStompClient } from '../services/stompClient';
import Modal from '../components/Modal';
import './DataSources.css';

// Paleta de 12 cores distintas (matizes diferentes, sem azuis repetidos) para
// que cada fonte de dados tenha uma cor unica mesmo com 9+ fontes.
const CHART_COLORS = ['#009BDB', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#eab308', '#a855f7'];

function formatBucketTs(iso, range) {
  if (!iso) return '';
  const d = new Date(iso);
  if (range === '7d') return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  if (range === '24h') return d.toLocaleString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_TONES = {
  HEALTHY:  'success',
  DEGRADED: 'warning',
  DOWN:     'danger',
  UNKNOWN:  'neutral',
  DISABLED: 'muted',
};

const STATUS_FILTER_ORDER = ['ALL', 'HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN'];

function formatRelativeSeconds(seconds) {
  if (seconds == null) return null;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86400)} d`;
}

function formatUptime(pct) {
  if (pct == null) return null;
  const n = typeof pct === 'string' ? parseFloat(pct) : pct;
  if (Number.isNaN(n)) return null;
  return n.toFixed(1);
}

function uptimeTone(pct) {
  if (pct == null) return 'neutral';
  const n = typeof pct === 'string' ? parseFloat(pct) : pct;
  if (Number.isNaN(n)) return 'neutral';
  if (n >= 99) return 'success';
  if (n >= 95) return 'warning';
  return 'danger';
}

export default function DataSources() {
  const { t } = useTranslation();
  const RANGES = [
    { key: '1h',  label: t('pages.dataSources.rangeLastHour') },
    { key: '6h',  label: t('pages.dataSources.range6h') },
    { key: '24h', label: t('pages.dataSources.range24h') },
    { key: '7d',  label: t('pages.dataSources.range7d') },
  ];
  const STATUS_META = {
    HEALTHY:  { label: t('pages.dataSources.states.healthy'),  tone: 'success' },
    DEGRADED: { label: t('pages.dataSources.states.degraded'), tone: 'warning' },
    DOWN:     { label: t('pages.dataSources.states.down'),     tone: 'danger'  },
    UNKNOWN:  { label: t('pages.dataSources.states.unknown'),  tone: 'neutral' },
    DISABLED: { label: t('pages.dataSources.states.disabled'), tone: 'muted'   },
  };
  const [sources, setSources] = useState([]);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterTipo, setFilterTipo] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState({ key: 'nome', dir: 'asc' });
  // Sprint 0 (F4 follow-up): modal de report por email.
  const [reportTarget, setReportTarget] = useState(null);
  const [reportMessage, setReportMessage] = useState('');
  const [reporting, setReporting] = useState(false);

  // Sprint 0 (F4 follow-up): timeline chart de respostas por fonte.
  const [chartRange, setChartRange] = useState('1h');
  const [chartSourceId, setChartSourceId] = useState(null); // null = todas
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setTimelineLoading(true);
    const params = new URLSearchParams({ range: chartRange });
    if (chartSourceId) params.set('dataSourceId', String(chartSourceId));
    api.get(`/data-sources/timeline?${params}`, { signal: ctrl.signal })
      .then((r) => setTimeline(r.data || []))
      .catch((err) => {
        if (err?.code !== 'ERR_CANCELED' && err?.name !== 'CanceledError') {
          console.error('Erro a carregar timeline:', err);
        }
      })
      .finally(() => setTimelineLoading(false));
    return () => ctrl.abort();
  }, [chartRange, chartSourceId]);

  const chartData = useMemo(() => {
    const byBucket = new Map();
    const nameSet = new Set();
    for (const row of timeline) {
      if (!byBucket.has(row.ts)) byBucket.set(row.ts, { ts: row.ts });
      byBucket.get(row.ts)[row.dataSourceName] = Number(row.okPct);
      nameSet.add(row.dataSourceName);
    }
    return {
      points: Array.from(byBucket.values()).sort((a, b) => a.ts.localeCompare(b.ts)),
      names: Array.from(nameSet),
    };
  }, [timeline]);

  const openReport = (ds) => {
    setReportTarget(ds);
    setReportMessage('');
  };
  const closeReport = () => {
    if (reporting) return;
    setReportTarget(null);
    setReportMessage('');
  };
  const submitReport = async () => {
    if (!reportTarget) return;
    setReporting(true);
    try {
      const r = await api.post(`/data-sources/${reportTarget.id}/report`, { mensagem: reportMessage });
      toast.success(`Email enviado para ${r.data?.destinatario ?? 'owner'}`);
      setReportTarget(null);
      setReportMessage('');
    } catch (err) {
      console.error('Erro a enviar report:', err);
      const msg = err.response?.data?.message || t('pages.dataSources.sendFailed');
      toast.error(msg);
    } finally {
      setReporting(false);
    }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    api.get('/data-sources', { signal: ctrl.signal })
      .then((r) => setSources(r.data || []))
      .catch((err) => {
        if (err?.code !== 'ERR_CANCELED' && err?.name !== 'CanceledError') {
          console.error('Erro a carregar DataSources:', err);
          toast.error(t('pages.dataSources.loadFailed'));
        }
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const client = createStompClient();
    client.onConnect = () => {
      client.subscribe('/topic/datasources', (msg) => {
        try {
          const payload = JSON.parse(msg.body);
          setSources((prev) => {
            const idx = prev.findIndex((d) => d.id === payload.id);
            if (idx === -1) return [...prev, payload];
            const next = [...prev];
            next[idx] = payload;
            return next;
          });
          if (payload.status === 'DOWN') {
            toast.error(`Fonte "${payload.nome}" está DOWN`, { toastId: `ds-down-${payload.id}` });
          } else if (payload.status === 'DEGRADED') {
            toast.warn(`Fonte "${payload.nome}" está degradada`, { toastId: `ds-degraded-${payload.id}` });
          }
        } catch (e) {
          console.error('Erro a processar WS /topic/datasources:', e);
        }
      });
    };
    client.activate();
    return () => { try { client.deactivate(); } catch (_) {} };
  }, []);

  const tipos = useMemo(() => {
    const set = new Set(sources.map((s) => s.tipo).filter(Boolean));
    return ['ALL', ...Array.from(set).sort()];
  }, [sources]);

  const counts = useMemo(() => {
    const c = { HEALTHY: 0, DEGRADED: 0, DOWN: 0, UNKNOWN: 0, DISABLED: 0 };
    for (const s of sources) c[s.status] = (c[s.status] || 0) + 1;
    return c;
  }, [sources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sources.filter((s) => {
      if (filterStatus !== 'ALL' && s.status !== filterStatus) return false;
      if (filterTipo !== 'ALL' && s.tipo !== filterTipo) return false;
      if (q && !(`${s.nome} ${s.descricao ?? ''} ${s.owner ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
    list.sort((a, b) => {
      const k = sortBy.key;
      let av = a[k];
      let bv = b[k];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv, 'pt') : (av < bv ? -1 : av > bv ? 1 : 0);
      return sortBy.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [sources, filterStatus, filterTipo, search, sortBy]);

  const toggleSort = (key) => {
    setSortBy((prev) => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });
  };

  const sortIcon = (key) => {
    if (sortBy.key !== key) return null;
    return sortBy.dir === 'asc'
      ? <span className="ds-sort-arrow" aria-hidden="true">↑</span>
      : <span className="ds-sort-arrow" aria-hidden="true">↓</span>;
  };

  return (
    <div className="datasources-page">
      <header className="ds-header">
        <h1 className="ds-title">{t('pages.dataSources.title')}</h1>
        <p className="ds-subtitle">{t('pages.dataSources.subtitle')}</p>
      </header>

      <div className="ds-stats">
        <StatPill value={counts.HEALTHY}  label={t('pages.dataSources.stats.healthy')}  tone="success" />
        <StatPill value={counts.DEGRADED} label={t('pages.dataSources.stats.degraded')} tone="warning" />
        <StatPill value={counts.DOWN}     label={t('pages.dataSources.stats.down')}     tone="danger"  />
        <StatPill value={counts.UNKNOWN}  label={t('pages.dataSources.stats.noData')}   tone="neutral" />
      </div>

      <div className="ds-toolbar">
        <div className="ds-search">
          <svg className="ds-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder={t('pages.dataSources.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('pages.dataSources.ariaSearch')}
          />
        </div>

        <div className="ds-filters">
          <div className="ds-filter">
            <span className="ds-filter-label">{t('pages.dataSources.filterState')}</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label={t('pages.dataSources.ariaFilterByState')}>
              {STATUS_FILTER_ORDER.map((k) => (
                <option key={k} value={k}>{k === 'ALL' ? t('pages.dataSources.filterAll') : STATUS_META[k].label}</option>
              ))}
            </select>
          </div>
          <div className="ds-filter">
            <span className="ds-filter-label">{t('pages.dataSources.filterType')}</span>
            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} aria-label={t('pages.dataSources.ariaFilterByType')}>
              {tipos.map((tp) => (
                <option key={tp} value={tp}>{tp === 'ALL' ? t('pages.dataSources.filterAll') : tp}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="ds-table-wrapper">
        <table className="ds-table">
          <thead>
            <tr>
              <th className="ds-th ds-th-sortable ds-th-status" onClick={() => toggleSort('status')} aria-sort={sortBy.key === 'status' ? (sortBy.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <span>{t('pages.dataSources.headers.state')} {sortIcon('status')}</span>
              </th>
              <th className="ds-th ds-th-sortable" onClick={() => toggleSort('nome')} aria-sort={sortBy.key === 'nome' ? (sortBy.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <span>{t('pages.dataSources.headers.name')} {sortIcon('nome')}</span>
              </th>
              <th className="ds-th ds-th-sortable" onClick={() => toggleSort('tipo')} aria-sort={sortBy.key === 'tipo' ? (sortBy.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <span>{t('pages.dataSources.headers.type')} {sortIcon('tipo')}</span>
              </th>
              <th className="ds-th ds-th-sortable ds-th-right" onClick={() => toggleSort('lastSync')} aria-sort={sortBy.key === 'lastSync' ? (sortBy.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <span>{t('pages.dataSources.headers.lastPulse')} {sortIcon('lastSync')}</span>
              </th>
              <th className="ds-th ds-th-sortable ds-th-right" onClick={() => toggleSort('uptimePct24h')} aria-sort={sortBy.key === 'uptimePct24h' ? (sortBy.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <span>{t('pages.dataSources.headers.uptime24h')} {sortIcon('uptimePct24h')}</span>
              </th>
              <th className="ds-th ds-th-sortable ds-th-right" onClick={() => toggleSort('uptimePct7d')} aria-sort={sortBy.key === 'uptimePct7d' ? (sortBy.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <span>{t('pages.dataSources.headers.uptime7d')} {sortIcon('uptimePct7d')}</span>
              </th>
              <th className="ds-th">{t('pages.dataSources.headers.owner')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="ds-row-skeleton">
                  <td colSpan={7}><div className="ds-skel" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="ds-empty-cell">
                  <div className="ds-empty">
                    <h3>{t('pages.dataSources.emptyTitle')}</h3>
                    <p>{t('pages.dataSources.emptyHint')}</p>
                    <button type="button" className="ds-btn-ghost" onClick={() => { setFilterStatus('ALL'); setFilterTipo('ALL'); setSearch(''); }}>
                      {t('pages.dataSources.clearFilters')}
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((d) => {
                const meta = STATUS_META[d.status] || STATUS_META.UNKNOWN;
                const last = formatRelativeSeconds(d.secondsSinceLastSync);
                const up24 = formatUptime(d.uptimePct24h);
                const up7d = formatUptime(d.uptimePct7d);
                return (
                  <tr key={d.id}>
                    <td className="ds-td-status">
                      <span className={`ds-status ds-status-${meta.tone}`}>
                        <span className={`ds-status-dot ds-status-dot-${meta.tone}`} aria-hidden="true" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="ds-td-name">
                      <div className="ds-name" title={t(`pages.dataSources.sourceName.${d.tipo}`, d.nome)}>{t(`pages.dataSources.sourceName.${d.tipo}`, d.nome)}</div>
                      {d.descricao && <div className="ds-desc" title={t(`pages.dataSources.sourceDesc.${d.tipo}`, d.descricao)}>{t(`pages.dataSources.sourceDesc.${d.tipo}`, d.descricao)}</div>}
                    </td>
                    <td>
                      <span className="ds-tipo-pill">{d.tipo}</span>
                    </td>
                    <td className="ds-td-right ds-mono">
                      {last ? (
                        <span title={d.lastSync ? new Date(d.lastSync).toLocaleString('pt-PT') : undefined}>
                          {t('pages.dataSources.relativePrefix')}{last}
                        </span>
                      ) : (
                        <span className="ds-muted">—</span>
                      )}
                    </td>
                    <td className="ds-td-right ds-mono">
                      {up24 != null
                        ? <span className={`ds-uptime ds-uptime-${uptimeTone(d.uptimePct24h)}`}>{up24}%</span>
                        : <span className="ds-muted">—</span>}
                    </td>
                    <td className="ds-td-right ds-mono">
                      {up7d != null
                        ? <span className={`ds-uptime ds-uptime-${uptimeTone(d.uptimePct7d)}`}>{up7d}%</span>
                        : <span className="ds-muted">—</span>}
                    </td>
                    <td>
                      <div className="ds-owner-cell">
                        <span className="ds-owner-name">{d.owner || <span className="ds-muted">—</span>}</span>
                        <div className="ds-contacts">
                          {d.contactoEmail && (
                            <button
                              type="button"
                              className="ds-contact"
                              title={`${t('pages.dataSources.reportTooltipPrefix')}${d.contactoEmail}`}
                              aria-label={t('pages.dataSources.ariaReportEmail', { name: t(`pages.dataSources.sourceName.${d.tipo}`, d.nome) })}
                              onClick={() => openReport(d)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                              </svg>
                            </button>
                          )}
                          {d.contactoTelefone && (
                            <a className="ds-contact" href={`tel:${d.contactoTelefone}`} title={d.contactoTelefone} aria-label={t('pages.dataSources.ariaCall', { phone: d.contactoTelefone })}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                              </svg>
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="ds-footer-meta">
          {t('pages.dataSources.sourcesCount', { count: filtered.length })}
          {filtered.length !== sources.length && t('pages.dataSources.sourcesOf', { total: sources.length })}
        </div>
      )}

      <section className="ds-chart-section">
        <header className="ds-chart-header">
          <div>
            <h2 className="ds-chart-title">{t('pages.dataSources.chartTitle')}</h2>
            <p className="ds-chart-sub">{t('pages.dataSources.chartSubtitle')}</p>
          </div>
          <div className="ds-chart-controls">
            <div className="ds-chart-chips" role="group" aria-label={t('pages.dataSources.ariaRange')}>
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`ds-chart-chip ${chartRange === r.key ? 'is-active' : ''}`}
                  onClick={() => setChartRange(r.key)}
                  aria-pressed={chartRange === r.key}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <select
              className="ds-chart-source-select"
              value={chartSourceId ?? ''}
              onChange={(e) => setChartSourceId(e.target.value ? Number(e.target.value) : null)}
              aria-label={t('pages.dataSources.ariaSourceFilter')}
            >
              <option value="">{t('pages.dataSources.allSources')}</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{t(`pages.dataSources.sourceName.${s.tipo}`, s.nome)}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="ds-chart-wrapper">
          {timelineLoading ? (
            <div className="ds-chart-empty">{t('pages.dataSources.chartLoading')}</div>
          ) : chartData.points.length === 0 ? (
            <div className="ds-chart-empty">{t('pages.dataSources.chartEmpty')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData.points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, #f3f4f6)" />
                <XAxis
                  dataKey="ts"
                  tickFormatter={(v) => formatBucketTs(v, chartRange)}
                  tick={{ fontSize: 11, fill: 'var(--color-text-light, #9ca3af)' }}
                  minTickGap={32}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: 'var(--color-text-light, #9ca3af)' }}
                  width={42}
                />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, '']}
                  labelFormatter={(label) => formatBucketTs(label, chartRange)}
                  contentStyle={{
                    background: 'var(--color-surface, #fff)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '12px' }}
                />
                {chartData.names.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <Modal open={!!reportTarget} onClose={closeReport}>
        <div className="ds-report-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h3 id="modal-title" className="modal-title">{t('pages.dataSources.reportModalTitle')}</h3>
        <p id="modal-message" className="modal-message">
          {t('pages.dataSources.reportModalMessage')}
        </p>

        {reportTarget && (
          <div className="ds-report-summary">
            <div className="ds-report-row">
              <span className="ds-report-key">{t('pages.dataSources.reportSource')}</span>
              <span className="ds-report-val">
                {t(`pages.dataSources.sourceName.${reportTarget.tipo}`, reportTarget.nome)}
                <span className="ds-tipo-pill ds-report-tipo">{reportTarget.tipo}</span>
              </span>
            </div>
            <div className="ds-report-row">
              <span className="ds-report-key">{t('pages.dataSources.reportState')}</span>
              <span className={`ds-status ds-status-${(STATUS_META[reportTarget.status] || STATUS_META.UNKNOWN).tone}`}>
                <span className={`ds-status-dot ds-status-dot-${(STATUS_META[reportTarget.status] || STATUS_META.UNKNOWN).tone}`} aria-hidden="true" />
                {(STATUS_META[reportTarget.status] || STATUS_META.UNKNOWN).label}
              </span>
            </div>
            <div className="ds-report-row">
              <span className="ds-report-key">{t('pages.dataSources.reportTo')}</span>
              <span className="ds-report-val ds-report-email">{reportTarget.contactoEmail || '—'}</span>
            </div>
          </div>
        )}

        <label className="ds-report-label" htmlFor="ds-report-msg">{t('pages.dataSources.reportMessageLabel')}</label>
        <textarea
          id="ds-report-msg"
          className="ds-report-textarea"
          placeholder={t('pages.dataSources.reportTextareaPlaceholder')}
          value={reportMessage}
          onChange={(e) => setReportMessage(e.target.value)}
          rows={4}
          maxLength={1000}
          disabled={reporting}
        />

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={submitReport} disabled={reporting}>
            {reporting ? t('pages.dataSources.reportSubmitting') : t('pages.dataSources.reportSubmit')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={closeReport} disabled={reporting}>
            {t('pages.dataSources.reportCancel')}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function StatPill({ value, label, tone }) {
  return (
    <div className={`ds-stat ds-stat-${tone}`}>
      <span className="ds-stat-value">{value}</span>
      <span className="ds-stat-label">{label}</span>
    </div>
  );
}
