import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { createStompClient } from '../services/stompClient';
import './Panels.css';

// Sub-componente: combobox searchable de paragens. Substitui o <select>
// nativo (terrivel com ~500+ paragens). Renderiza um input com lista
// filtrada por nome ou codigo; click selecciona. Submete stopId via hidden input.
function StopSearch({ name, stops, defaultStopId, placeholder }) {
  const initial = defaultStopId ? stops.find(s => s.id === defaultStopId) : null;
  const [query, setQuery] = useState(initial ? `${initial.name} (${initial.code})` : '');
  const [selectedId, setSelectedId] = useState(defaultStopId || '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Sprint 5 (follow-up): o dropdown e' position: fixed para escapar ao
  // overflow:hidden do modal pai. As coords sao recalculadas no scroll/resize.
  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handler = () => updatePos();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  const filtered = stops.filter(s => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (s.name || '').toLowerCase().includes(q)
        || (s.code || '').toLowerCase().includes(q);
  }).slice(0, 50);

  const pick = (s) => {
    setQuery(`${s.name} (${s.code})`);
    setSelectedId(s.id);
    setOpen(false);
  };

  const onKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) pick(filtered[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="stop-search" ref={wrapRef}>
      <input type="hidden" name={name} value={selectedId} required />
      <input
        ref={inputRef}
        type="text"
        className="stop-search-input"
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setSelectedId(''); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        autoComplete="off"
      />
      {selectedId && (
        <button
          type="button"
          className="stop-search-clear"
          onClick={() => { setQuery(''); setSelectedId(''); setOpen(true); }}
          title="Limpar"
          aria-label="Limpar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      )}
      {open && filtered.length > 0 && (
        <ul
          className="stop-search-list"
          role="listbox"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          {filtered.map((s, i) => (
            <li
              key={s.id}
              className={`stop-search-item ${i === highlight ? 'is-highlight' : ''} ${s.id === selectedId ? 'is-selected' : ''}`}
              role="option"
              aria-selected={s.id === selectedId}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="stop-search-name">{s.name}</span>
              <span className="stop-search-code">{s.code}</span>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <ul
          className="stop-search-list"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          <li className="stop-search-empty">Sem resultados para "{query}"</li>
        </ul>
      )}
    </div>
  );
}

// Sub-componente: KPI card.
function PanelKpi({ tone, label, value, icon }) {
  const icons = {
    grid: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    online: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>,
    offline: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
    warn: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  };
  return (
    <div className={`panel-kpi panel-kpi--${tone}`}>
      <div className="panel-kpi-icon">{icons[icon]}</div>
      <div className="panel-kpi-text">
        <span className="panel-kpi-value">{value}</span>
        <span className="panel-kpi-label">{label}</span>
      </div>
    </div>
  );
}

// Sub-componente: card de painel com lista de proximas chegadas.
function PanelCard({ panel, stop, onEdit, onDelete, statusColor, t }) {
  const [etas, setEtas] = useState(null);
  const [loadingEtas, setLoadingEtas] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchEtas = () => {
      if (!panel.stopId) { setLoadingEtas(false); return; }
      api.get(`/stops/${panel.stopId}/panel`)
        .then(r => { if (!cancelled) setEtas(r.data?.etas || []); })
        .catch(() => { if (!cancelled) setEtas([]); })
        .finally(() => { if (!cancelled) setLoadingEtas(false); });
    };
    fetchEtas();
    const iv = setInterval(fetchEtas, 20000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [panel.stopId]);

  const delayChip = (eta) => {
    if (eta.delayMinutes == null) return null;
    const d = eta.delayMinutes;
    if (d <= -1) return <span className="panel-delay panel-delay--early">{t('pages.panels.early', 'adiantado')} {Math.abs(d)}m</span>;
    if (d >= 2) return <span className="panel-delay panel-delay--late">+{d}m {t('pages.panels.late', 'atraso')}</span>;
    return <span className="panel-delay panel-delay--ontime">{t('pages.panels.onTime', 'em horário')}</span>;
  };

  return (
    <article className="panel-card">
      <header className="panel-card-head">
        <div className="panel-card-id">
          <code>{panel.code}</code>
          <span className="panel-card-name">{panel.name}</span>
        </div>
        <span className="panel-status" style={{ background: statusColor[panel.status] || '#94a3b8' }}>
          {panel.status}
        </span>
      </header>
      <div className="panel-card-meta">
        <span><strong>{t('pages.panels.colType', 'Tipo')}:</strong> {panel.type}</span>
        <span><strong>{t('pages.panels.colStop', 'Paragem')}:</strong> {stop?.name || `#${panel.stopId}`}</span>
        <span><strong>{t('pages.panels.colBattery', 'Bateria')}:</strong> {panel.batteryPct != null ? `${panel.batteryPct}%` : '—'}</span>
      </div>
      <section className="panel-arrivals">
        <h4>{t('pages.panels.arrivalsTitle', 'Próximas chegadas')}</h4>
        {loadingEtas && <p className="panel-arrivals-empty">{t('common.loading', 'A carregar...')}</p>}
        {!loadingEtas && (!etas || etas.length === 0) && (
          <p className="panel-arrivals-empty">{t('pages.panels.noArrivals', 'Sem autocarros em aproximação.')}</p>
        )}
        {!loadingEtas && etas && etas.length > 0 && (
          <ul className="panel-arrivals-list">
            {etas.map((e, i) => (
              <li key={i} className="panel-arrival">
                <span className="panel-arrival-route" style={{ background: e.routeColor || '#6366f1' }}>{e.routeCode}</span>
                <span className="panel-arrival-bus">{e.busCode}</span>
                <span className="panel-arrival-times">
                  {e.scheduledArrival && <span className="panel-arrival-sched">{e.scheduledArrival}</span>}
                  <span className="panel-arrival-eta">{e.etaMinutes}m</span>
                </span>
                {delayChip(e)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer className="panel-card-actions">
        <button className="panels-btn-link" onClick={() => onEdit(panel)}>
          {t('common.edit', 'Editar')}
        </button>
        <button className="panels-btn-link panels-btn-danger" onClick={() => onDelete(panel)}>
          {t('common.delete', 'Eliminar')}
        </button>
      </footer>
    </article>
  );
}

/**
 * Sprint 3 (3.5): CRUD de paineis DMS.
 *
 * - Lista painéis com status em tempo real (STOMP /topic/panels).
 * - Form criar/editar com selector de paragem.
 * - Eliminar (com confirm).
 */
export default function Panels() {
  const { t } = useTranslation();
  const [panels, setPanels] = useState([]);
  const [stops, setStops] = useState([]);
  const [stats, setStats] = useState({ total: 0, byStatus: [], byType: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} (novo) | {...painel} (editar)
  const [filter, setFilter] = useState('all'); // all | online | offline | faulty

  const load = () => {
    Promise.all([
      api.get('/panels').then(r => r.data || []),
      api.get('/stops').then(r => r.data || []),
      api.get('/panels/stats').then(r => r.data || {}),
    ]).then(([p, s, st]) => {
      setPanels(p);
      setStops(s);
      setStats(st);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const client = createStompClient({
      onConnect: () => {
        client.subscribe('/topic/panels', msg => {
          try {
            const ev = JSON.parse(msg.body);
            setPanels(prev => prev.map(p =>
              p.code === ev.code
                ? { ...p, status: ev.status, batteryPct: ev.batteryPct > 0 ? ev.batteryPct : p.batteryPct, lastHeartbeat: ev.lastHeartbeat }
                : p
            ));
          } catch { /* ignore */ }
        });
      },
    });
    client.activate();
    return () => client.deactivate();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      code: fd.get('code'),
      name: fd.get('name'),
      type: fd.get('type'),
      stopId: Number(fd.get('stopId')),
      currentMessage: fd.get('currentMessage') || null,
      enabled: fd.get('enabled') === 'on',
    };
    try {
      if (editing?.id) {
        await api.put(`/panels/${editing.id}`, body);
      } else {
        await api.post('/panels', body);
      }
      setEditing(null);
      load();
    } catch (err) {
      alert(t('pages.panels.saveError', 'Falhou: ') + (err.response?.data?.message || err.message));
    }
  };

  const onDelete = async (p) => {
    if (!window.confirm(t('pages.panels.confirmDelete', `Eliminar painel ${p.code}?`))) return;
    await api.delete(`/panels/${p.id}`);
    load();
  };

  const statusColor = {
    ONLINE: '#10b981', OFFLINE: '#ef4444', FAULTY: '#f59e0b',
    LOW_BATTERY: '#f59e0b', UNKNOWN: '#94a3b8', DISABLED: '#64748b',
  };

  // ─── Derivados ───────────────────────────────────────────────
  const countByStatus = (st) => panels.filter(p => p.status === st).length;
  const onlineCount = countByStatus('ONLINE');
  const offlineCount = countByStatus('OFFLINE');
  const faultyCount = countByStatus('FAULTY') + countByStatus('LOW_BATTERY');
  const visiblePanels = panels.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'online') return p.status === 'ONLINE';
    if (filter === 'offline') return p.status === 'OFFLINE';
    if (filter === 'faulty') return p.status === 'FAULTY' || p.status === 'LOW_BATTERY';
    return true;
  });

  return (
    <div className="panels-page">
      <header className="panels-header">
        <div className="panels-header-text">
          <h1>
            <span className="panels-header-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </span>
            {t('pages.panels.title', 'Painéis DMS')}
          </h1>
          <p className="panels-subtitle">
            {t('pages.panels.subtitle', 'Painéis de informação nas paragens da rede TUB.')}
          </p>
        </div>
        <button className="panels-btn-primary panels-btn-create" onClick={() => setEditing({})}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {t('pages.panels.create', 'Novo painel')}
        </button>
      </header>

      {/* KPIs */}
      <section className="panels-kpis" aria-label="KPIs">
        <PanelKpi tone="primary" label={t('pages.panels.kpiTotal', 'Total')} value={panels.length} icon="grid" />
        <PanelKpi tone="ok" label={t('pages.panels.kpiOnline', 'Online')} value={onlineCount} icon="online" />
        <PanelKpi tone="muted" label={t('pages.panels.kpiOffline', 'Offline')} value={offlineCount} icon="offline" />
        <PanelKpi tone="warn" label={t('pages.panels.kpiFaulty', 'A precisar de atenção')} value={faultyCount} icon="warn" />
      </section>

      {/* Filter tabs */}
      <nav className="panels-tabs" role="tablist">
        <button role="tab" className={`panels-tab ${filter === 'all' ? 'is-active' : ''}`} onClick={() => setFilter('all')}>
          {t('pages.panels.tabAll', 'Todos')}
          <span className="panels-tab-count">{panels.length}</span>
        </button>
        <button role="tab" className={`panels-tab ${filter === 'online' ? 'is-active' : ''}`} onClick={() => setFilter('online')}>
          {t('pages.panels.tabOnline', 'Online')}
          <span className="panels-tab-count">{onlineCount}</span>
        </button>
        <button role="tab" className={`panels-tab ${filter === 'offline' ? 'is-active' : ''}`} onClick={() => setFilter('offline')}>
          {t('pages.panels.tabOffline', 'Offline')}
          <span className="panels-tab-count">{offlineCount}</span>
        </button>
        <button role="tab" className={`panels-tab ${filter === 'faulty' ? 'is-active' : ''}`} onClick={() => setFilter('faulty')}>
          {t('pages.panels.tabFaulty', 'Atenção')}
          <span className="panels-tab-count">{faultyCount}</span>
        </button>
      </nav>

      {loading && <p style={{ padding: '0 2rem' }}>{t('common.loading', 'A carregar...')}</p>}

      {/* Grid de cards */}
      {!loading && panels.length === 0 && (
        <div className="panels-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <h3>{t('pages.panels.emptyTitle', 'Sem painéis')}</h3>
          <p>{t('pages.panels.empty', 'Cria o primeiro com o botão acima.')}</p>
        </div>
      )}
      {!loading && panels.length > 0 && visiblePanels.length === 0 && (
        <div className="panels-empty">
          <p>{t('pages.panels.emptyFilter', 'Sem painéis neste filtro.')}</p>
        </div>
      )}
      <div className="panels-grid">
        {visiblePanels.map(p => {
          const stop = stops.find(s => s.id === p.stopId);
          return (
            <PanelCard
              key={p.id}
              panel={p}
              stop={stop}
              onEdit={setEditing}
              onDelete={onDelete}
              statusColor={statusColor}
              t={t}
            />
          );
        })}
      </div>

      {/* Modal CRUD — estilo coerente com Users/Buses */}
      {editing && (
        <div
          className="panels-modal-backdrop"
          onClick={() => setEditing(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="panels-modal-title"
        >
          <div className="panels-modal" onClick={e => e.stopPropagation()}>
            <header className="panels-modal-header">
              <h3 id="panels-modal-title">
                {editing.id ? t('pages.panels.editTitle', 'Editar painel') : t('pages.panels.createTitle', 'Novo painel')}
                <span className={`panels-modal-badge ${editing.id ? 'panels-modal-badge--edit' : 'panels-modal-badge--new'}`}>
                  {editing.id ? t('pages.panels.badgeEdit', 'Editar') : t('pages.panels.badgeNew', 'Novo')}
                </span>
              </h3>
              <button
                type="button"
                className="panels-modal-close"
                onClick={() => setEditing(null)}
                aria-label={t('common.close', 'Fechar')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </header>
            <form onSubmit={onSubmit}>
              <div className="panels-modal-body">
                <div className="panels-form-grid">
                  <label className="panels-field">
                    <span className="panels-field-label">{t('pages.panels.fldCode', 'Código (serial)')}</span>
                    <input name="code" required defaultValue={editing.code || ''} disabled={!!editing.id} />
                  </label>
                  <label className="panels-field">
                    <span className="panels-field-label">{t('pages.panels.fldName', 'Nome')}</span>
                    <input name="name" required defaultValue={editing.name || ''} />
                  </label>
                  <label className="panels-field">
                    <span className="panels-field-label">{t('pages.panels.fldType', 'Tipo')}</span>
                    <select name="type" required defaultValue={editing.type || 'EPAPER'}>
                      <option value="EPAPER">EPAPER (solar)</option>
                      <option value="LED">LED</option>
                      <option value="TFT">TFT</option>
                    </select>
                  </label>
                  <label className="panels-field">
                    <span className="panels-field-label">{t('pages.panels.fldStop', 'Paragem')}</span>
                    <StopSearch
                      name="stopId"
                      stops={stops}
                      defaultStopId={editing.stopId}
                      placeholder={t('pages.panels.stopSearchPh', 'Procurar paragem por nome ou código...')}
                    />
                  </label>
                  <label className="panels-field panels-field--full">
                    <span className="panels-field-label">{t('pages.panels.fldMessage', 'Mensagem actual (opcional)')}</span>
                    <input name="currentMessage" defaultValue={editing.currentMessage || ''} />
                  </label>
                  <label className="panels-field panels-field--full panels-checkbox">
                    <input type="checkbox" name="enabled" defaultChecked={editing.enabled !== false} />
                    <span>{t('pages.panels.fldEnabled', 'Activo')}</span>
                  </label>
                </div>
              </div>
              <footer className="panels-modal-footer">
                <button type="button" className="panels-btn-secondary" onClick={() => setEditing(null)}>
                  {t('common.cancel', 'Cancelar')}
                </button>
                <button type="submit" className="panels-btn-primary">
                  {t('common.save', 'Guardar')}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
