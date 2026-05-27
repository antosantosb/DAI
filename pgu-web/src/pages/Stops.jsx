import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';

const PAGE_SIZE = 50;

export default function Stops() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [stops, setStops] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', maxBusesDisplay: 3, panelMessage: '', latitude: '', longitude: '' });
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  // Sprint -1 (FE-14): substitui window.confirm por Modal a11y-friendly.
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null });

  // Sprint 0 (F4 follow-up): infinite scroll para evitar render de 1999 rows
  // de uma vez (era a causa do lag e do toast "Pedido demorou demasiado").
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef(null);

  const load = () => {
    api.get('/stops').then(r => setStops(r.data || [])).catch(() => setStops([]));
  };

  useEffect(load, []);

  const resetForm = () => {
    setForm({ name: '', code: '', maxBusesDisplay: 3, panelMessage: '', latitude: '', longitude: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = editing
      ? Object.fromEntries(Object.entries({
          name: form.name || undefined,
          code: form.code || undefined,
          maxBusesDisplay: form.maxBusesDisplay ? parseInt(form.maxBusesDisplay) : undefined,
          panelMessage: form.panelMessage || undefined,
          latitude: form.latitude ? parseFloat(form.latitude) : undefined,
          longitude: form.longitude ? parseFloat(form.longitude) : undefined,
        }).filter(([, v]) => v !== undefined))
      : {
          name: form.name,
          code: form.code,
          maxBusesDisplay: parseInt(form.maxBusesDisplay) || 3,
          panelMessage: form.panelMessage || null,
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
        };

    const req = editing
      ? api.patch(`/stops/${editing}`, payload)
      : api.post('/stops', payload);

    req.then(() => { resetForm(); load(); })
       .catch(err => alert(t('pages.stops.errorPrefix') + (err.response?.data?.message || err.message)));
  };

  const startEdit = (stop) => {
    setForm({
      name: stop.name,
      code: stop.code,
      maxBusesDisplay: stop.maxBusesDisplay ?? 3,
      panelMessage: stop.panelMessage || '',
      latitude: stop.latitude,
      longitude: stop.longitude,
    });
    setEditing(stop.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id) => {
    setDeleteModal({ open: true, id });
  };

  const confirmDelete = () => {
    if (!deleteModal.id) return;
    api.delete(`/stops/${deleteModal.id}`).then(load);
    setDeleteModal({ open: false, id: null });
  };

  const filtered = stops.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q);
  });

  // Sprint 0 (F4 follow-up): reset infinite scroll quando search/dataset muda.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, stops.length]);

  // Sprint 0 (F4 follow-up): IntersectionObserver no loader row carrega +50
  // automaticamente quando entra na viewport.
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
      <div className="page-header">
        <div>
          <h1>{t('pages.stops.title')}</h1>
          <p className="page-subtitle">{t('pages.stops.registered', { count: stops.length })}</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
            {t('pages.stops.newButton')}
          </button>
        )}
      </div>

      <div className="bus-toolbar" style={{ marginBottom: 20 }}>
        <div className="search-bar">
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            placeholder={t('pages.stops.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {showForm && (
        <div className="form-overlay">
          <form className="form-card" onSubmit={handleSubmit}>
            <h3>{editing ? t('pages.stops.edit') : t('pages.stops.create')}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('pages.stops.fieldName')}</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required={!editing} />
              </div>
              <div className="form-group">
                <label>{t('pages.stops.fieldCode')}</label>
                <input value={form.code} onChange={e => setForm({...form, code: e.target.value})} required={!editing} />
              </div>
              <div className="form-group">
                <label>{t('pages.stops.maxBusesPanel')}</label>
                <input type="number" min="1" max="10" value={form.maxBusesDisplay} onChange={e => setForm({...form, maxBusesDisplay: e.target.value})} />
              </div>
              <div className="form-group">
                <label>{t('pages.stops.panelMessage')}</label>
                <input value={form.panelMessage} onChange={e => setForm({...form, panelMessage: e.target.value})} placeholder={t('pages.stops.panelMessagePlaceholder')} />
              </div>
              <div className="form-group">
                <label>{t('common.latitude')}</label>
                <input type="number" step="any" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} required={!editing} />
              </div>
              <div className="form-group">
                <label>{t('common.longitude')}</label>
                <input type="number" step="any" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} required={!editing} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">{editing ? t('pages.stops.save') : t('common.create')}</button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>{t('pages.stops.cancel')}</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '70px' }}>{t('pages.stops.headers.id')}</th>
              <th>{t('pages.stops.headers.name')}</th>
              <th style={{ width: '110px' }}>{t('pages.stops.headers.code')}</th>
              <th style={{ width: '80px' }}>{t('pages.stops.headers.panel')}</th>
              <th style={{ width: '150px' }}>{t('pages.stops.headers.message')}</th>
              <th style={{ width: '130px' }}>{t('pages.stops.headers.latitude')}</th>
              <th style={{ width: '130px' }}>{t('pages.stops.headers.longitude')}</th>
              <th style={{ width: '170px' }}>{t('pages.stops.headers.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(stop => (
              <tr key={stop.id}>
                <td><span className="count-badge">{stop.id}</span></td>
                <td><strong>{stop.name}</strong></td>
                <td><code style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600 }}>{stop.code}</code></td>
                <td>{stop.maxBusesDisplay ?? 3}</td>
                <td>{stop.panelMessage || '—'}</td>
                <td>{stop.latitude?.toFixed(6)}</td>
                <td>{stop.longitude?.toFixed(6)}</td>
                <td className="actions">
                  {isAdmin && (
                    <>
                      <button className="btn btn-sm" onClick={() => startEdit(stop)}>{t('common.edit')}</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(stop.id)}>{t('common.delete')}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {visibleCount < filtered.length && (
              <tr ref={loaderRef}>
                <td colSpan="8" className="empty" style={{ padding: '14px', color: 'var(--color-text-light)' }}>
                  {t('pages.stops.loadingMore', { current: visibleCount, total: filtered.length })}
                </td>
              </tr>
            )}
            {filtered.length === 0 && (
              <tr><td colSpan="8" className="empty">
                {search ? t('pages.stops.notFound') : t('pages.stops.noStops')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sprint -1 (FE-14): confirm Modal substitui window.confirm() */}
      <Modal
        open={deleteModal.open}
        type="danger"
        title={t('pages.stops.deleteTitle')}
        message={t('pages.stops.deleteMessage')}
        confirmText={t('pages.stops.confirmDelete')}
        cancelText={t('pages.stops.cancel')}
        onConfirm={confirmDelete}
        onClose={() => setDeleteModal({ open: false, id: null })}
      />
    </div>
  );
}
