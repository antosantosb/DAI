import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import './Routes.css';

const PAGE_SIZE = 50;

export default function Routes() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  // Sprint 1 follow-up: dev tem os mesmos privilégios de gestão que admin.
  const isAdmin = hasRole('admin') || hasRole('developer');
  const [routes, setRoutes] = useState([]);
  const [allStops, setAllStops] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', color: '' });
  const [routeStops, setRouteStops] = useState([]);
  const [showForm, setShowForm] = useState(false);
  // Sprint 1 (F4): pre-popular a pesquisa a partir de ?q= (deep-link do
  // calendario — clicar numa rota leva aqui ja' filtrado).
  const [search, setSearch] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('q') || '';
    } catch { return ''; }
  });
  const [modal, setModal] = useState({ open: false });
  const [dragIdx, setDragIdx] = useState(null);
  // Sprint 1 (F0): filtro de operador. Pre-popula do query param ?operator=CODE
  // (usado pelo link "Rotas" na pagina Operators).
  const [operatorsList, setOperatorsList] = useState([]);
  const [operatorFilter, setOperatorFilter] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('operator') || 'all';
    } catch { return 'all'; }
  });

  const showModalMsg = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  const load = () => {
    api.get('/routes').then(r => setRoutes(r.data || [])).catch(() => setRoutes([]));
    api.get('/stops').then(r => setAllStops(r.data || [])).catch(() => setAllStops([]));
    // Sprint 1 (F0): carregar operadores para popular o filtro
    api.get('/operators').then(r => setOperatorsList(r.data || [])).catch(() => setOperatorsList([]));
  };

  useEffect(load, []);

  const resetForm = () => {
    setForm({ name: '', code: '', color: '' });
    setRouteStops([]);
    setOriginalStops([]);
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const stops = routeStops.map((s, i) => ({ stopId: s.id, stopOrder: i + 1 }));

    // Check if stops changed compared to original
    const currentStopIds = routeStops.map(s => s.id);
    const stopsChanged = !editing ||
      currentStopIds.length !== originalStops.length ||
      currentStopIds.some((id, i) => id !== originalStops[i]);

    const payload = editing
      ? {
          ...(form.name ? { name: form.name } : {}),
          ...(form.code ? { code: form.code } : {}),
          ...(form.color ? { color: form.color } : {}),
          ...(stopsChanged ? { stops } : {}),
        }
      : { name: form.name, code: form.code, color: form.color || null, stops };

    const req = editing
      ? api.patch(`/routes/${editing}`, payload)
      : api.post('/routes', payload);

    req.then(() => {
      resetForm();
      load();
      showModalMsg({ type: 'success', title: t('pages.routes.successTitle'), message: editing ? t('pages.routes.successUpdated') : t('pages.routes.successCreated') });
    }).catch(err => {
      showModalMsg({ type: 'danger', title: t('pages.routes.errorTitle'), message: err.response?.data?.message || err.message });
    });
  };

  const [originalStops, setOriginalStops] = useState([]);

  const startEdit = (route) => {
    setForm({ name: route.name, code: route.code, color: route.color || '' });
    const sorted = (route.stops || [])
      .sort((a, b) => a.stopOrder - b.stopOrder)
      .map(rs => {
        const full = allStops.find(s => s.id === rs.stopId);
        return full || { id: rs.stopId, name: rs.stopName || '?', code: rs.stopCode || '?' };
      });
    setRouteStops(sorted);
    setOriginalStops(sorted.map(s => s.id));
    setEditing(route.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id) => {
    showModalMsg({
      type: 'danger',
      title: t('pages.routes.deleteTitle'),
      message: t('pages.routes.deleteMessage'),
      confirmText: t('pages.routes.deleteConfirm'),
      onConfirm: () => { closeModal(); api.delete(`/routes/${id}`).then(load); },
    });
  };

  // Stop management
  const addStop = (stopId) => {
    const stop = allStops.find(s => s.id === parseInt(stopId));
    if (!stop) return;
    setRouteStops([...routeStops, stop]);
  };

  const removeStop = (idx) => {
    setRouteStops(routeStops.filter((_, i) => i !== idx));
  };

  const moveStop = (from, to) => {
    if (to < 0 || to >= routeStops.length) return;
    const arr = [...routeStops];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setRouteStops(arr);
  };

  // Drag & drop
  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (idx) => {
    if (dragIdx !== null && dragIdx !== idx) {
      moveStop(dragIdx, idx);
    }
    setDragIdx(null);
  };

  const availableStops = allStops.filter(s => !routeStops.find(rs => rs.id === s.id));

  const filtered = routes.filter(r => {
    // Sprint 1 (F0): filtrar por operador
    if (operatorFilter && operatorFilter !== 'all') {
      if (r.operatorCode !== operatorFilter) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q);
  });

  // Sprint 0 (F4 follow-up): infinite scroll, igual ao Stops.jsx.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, operatorFilter, routes.length]);

  useEffect(() => {
    if (visibleCount >= filtered.length) return;
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
      }
    }, { rootMargin: '300px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div>
      <Modal
        open={modal.open}
        onClose={closeModal}
        onConfirm={modal.onConfirm}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        confirmText={modal.confirmText}
      />

      <div className="page-header">
        <div>
          <h1>{t('pages.routes.title')}</h1>
          <p className="page-subtitle">{t('pages.routes.registered', { count: routes.length })}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Sprint 1 (F1): export GeoJSON (R.BO.01) — aberto a qualquer
              utilizador autenticado (na pratica o endpoint e' permitAll,
              mas escondemos o botao no UI fora de admin para nao poluir). */}
          {isAdmin && (
            <a
              href="/api/v1/routes/export.geojson"
              className="btn btn-secondary"
              download="pgu-routes.geojson"
              title={t('pages.routes.exportGeoJsonTitle')}
            >
              {t('pages.routes.exportGeoJson')}
            </a>
          )}
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
              {t('pages.routes.newButton')}
            </button>
          )}
        </div>
      </div>

      <div
        className="bus-toolbar routes-toolbar"
        style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'nowrap' }}
      >
        <div className="search-bar" style={{ flex: '1 1 auto', minWidth: 0, maxWidth: 340 }}>
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            placeholder={t('pages.routes.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {/* Sprint 1 (F0): filtro por operador (R.IVT.03) */}
        {operatorsList.length > 0 && (
          <div
            className="routes-operator-filter"
            style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
          >
            <label htmlFor="route-operator-filter" className="user-filter-label">
              {t('pages.routes.filterOperatorLabel')}
            </label>
            <select
              id="route-operator-filter"
              value={operatorFilter}
              onChange={e => setOperatorFilter(e.target.value)}
              className="routes-operator-select"
              style={{ maxWidth: 160 }}
            >
              <option value="all">{t('pages.routes.filterOperatorAll')}</option>
              {operatorsList.map(op => (
                <option key={op.id} value={op.code} title={op.name}>
                  {op.code}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {showForm && (
        <div className="form-overlay">
          <form className="form-card" onSubmit={handleSubmit}>
            <h3>{editing ? t('pages.routes.edit') : t('pages.routes.create')}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('pages.routes.fieldName')}</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required={!editing} />
              </div>
              <div className="form-group">
                <label>{t('pages.routes.fieldCode')}</label>
                <input value={form.code} onChange={e => setForm({...form, code: e.target.value})} required={!editing} />
              </div>
              <div className="form-group">
                <label>{t('pages.routes.fieldColor')}</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={form.color || '#009BDB'}
                    onChange={e => setForm({...form, color: e.target.value})}
                    style={{ width: '44px', height: '40px', padding: '2px', cursor: 'pointer', borderRadius: '8px', border: '1.5px solid var(--color-border)' }}
                  />
                  <input value={form.color} onChange={e => setForm({...form, color: e.target.value})} placeholder="#009BDB" style={{ flex: 1 }} />
                </div>
              </div>
            </div>

            {/* Stop assignment */}
            <div className="route-stops-section">
              <div className="route-stops-header">
                <label>{t('pages.routes.stopsOfRoute')}</label>
                <span className="form-hint">{t('pages.routes.stopsAddedHint', { count: routeStops.length })}</span>
              </div>

              <div className="route-stops-add">
                <select
                  value=""
                  onChange={e => { addStop(e.target.value); e.target.value = ''; }}
                  disabled={availableStops.length === 0}
                >
                  <option value="">
                    {availableStops.length === 0 ? t('pages.routes.allStopsAdded') : t('pages.routes.addStopPlaceholder')}
                  </option>
                  {availableStops.map(s => (
                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                  ))}
                </select>
              </div>

              {routeStops.length === 0 ? (
                <div className="route-stops-empty">
                  {t('pages.routes.emptyStops')}
                </div>
              ) : (
                <div className="route-stops-list">
                  {routeStops.map((stop, idx) => (
                    <div
                      key={`${stop.id}-${idx}`}
                      className={`route-stop-item ${dragIdx === idx ? 'route-stop-item--dragging' : ''}`}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(idx)}
                      onDragEnd={() => setDragIdx(null)}
                    >
                      <span className="route-stop-grip">&#8942;&#8942;</span>
                      <span className="route-stop-order">{idx + 1}</span>
                      <div className="route-stop-info">
                        <span className="route-stop-name">{stop.name}</span>
                        <span className="route-stop-code">{stop.code}</span>
                      </div>
                      <div className="route-stop-actions">
                        <button type="button" className="route-stop-btn" onClick={() => moveStop(idx, idx - 1)} disabled={idx === 0} title={t('pages.routes.moveUp')}>&#9650;</button>
                        <button type="button" className="route-stop-btn" onClick={() => moveStop(idx, idx + 1)} disabled={idx === routeStops.length - 1} title={t('pages.routes.moveDown')}>&#9660;</button>
                        <button type="button" className="route-stop-btn route-stop-btn--remove" onClick={() => removeStop(idx)} title={t('pages.routes.removeStop')}>&#10005;</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">{editing ? t('pages.routes.save') : t('common.create')}</button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>{t('pages.routes.cancel')}</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '70px' }}>{t('pages.routes.headers.id')}</th>
              <th style={{ width: '110px' }}>{t('pages.routes.headers.code')}</th>
              <th>{t('pages.routes.headers.name')}</th>
              <th style={{ width: '110px' }}>{t('pages.routes.headers.operator')}</th>
              <th style={{ width: '130px' }}>{t('pages.routes.headers.color')}</th>
              <th style={{ width: '100px' }}>{t('pages.routes.headers.stops')}</th>
              <th style={{ width: '170px' }}>{t('pages.routes.headers.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(route => (
              <tr key={route.id}>
                <td><span className="count-badge">{route.id}</span></td>
                <td><code style={{ fontSize: 13, fontWeight: 700, color: route.color || 'var(--color-primary)' }}>{route.code}</code></td>
                <td><strong>{route.name}</strong></td>
                <td>
                  {route.operatorCode ? (
                    <span className="count-badge" title={route.operatorName || route.operatorCode}>
                      {route.operatorCode}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-light)' }}>—</span>
                  )}
                </td>
                <td>
                  {route.color && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span className="color-dot" style={{ background: route.color }}></span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{route.color}</span>
                    </span>
                  )}
                </td>
                <td><span className="count-badge">{route.stops?.length || 0}</span></td>
                <td className="actions">
                  {isAdmin && (
                    <>
                      <button className="btn btn-sm" onClick={() => startEdit(route)}>{t('common.edit')}</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(route.id)}>{t('common.delete')}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {visibleCount < filtered.length && (
              <tr ref={loaderRef}>
                <td colSpan="7" className="empty" style={{ padding: '14px', color: 'var(--color-text-light)' }}>
                  {t('pages.routes.loadingMore', { current: visibleCount, total: filtered.length })}
                </td>
              </tr>
            )}
            {filtered.length === 0 && (
              <tr><td colSpan="7" className="empty">
                {search ? t('pages.routes.notFound') : t('pages.routes.noRoutes')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
