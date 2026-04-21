import { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import './Routes.css';

export default function Routes() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [routes, setRoutes] = useState([]);
  const [allStops, setAllStops] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', color: '' });
  const [routeStops, setRouteStops] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open: false });
  const [dragIdx, setDragIdx] = useState(null);

  const showModalMsg = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  const load = () => {
    api.get('/routes').then(r => setRoutes(r.data || [])).catch(() => setRoutes([]));
    api.get('/stops').then(r => setAllStops(r.data || [])).catch(() => setAllStops([]));
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
      showModalMsg({ type: 'success', title: 'Sucesso', message: editing ? 'Rota atualizada com sucesso.' : 'Rota criada com sucesso.' });
    }).catch(err => {
      showModalMsg({ type: 'danger', title: 'Erro', message: err.response?.data?.message || err.message });
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
      title: 'Apagar Rota?',
      message: 'A rota e todas as associacoes de paragens serao removidas.',
      confirmText: 'Apagar',
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
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q);
  });

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
          <h1>Rotas</h1>
          <p className="page-subtitle">{routes.length} rotas registadas</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
            + Nova Rota
          </button>
        )}
      </div>

      <div className="bus-toolbar" style={{ marginBottom: 20 }}>
        <div className="search-bar">
          <span className="search-bar-icon">&#128269;</span>
          <input
            placeholder="Pesquisar rota..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {showForm && (
        <div className="form-overlay">
          <form className="form-card" onSubmit={handleSubmit}>
            <h3>{editing ? 'Editar Rota' : 'Nova Rota'}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Nome</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required={!editing} />
              </div>
              <div className="form-group">
                <label>Codigo</label>
                <input value={form.code} onChange={e => setForm({...form, code: e.target.value})} required={!editing} />
              </div>
              <div className="form-group">
                <label>Cor</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={form.color || '#6366f1'}
                    onChange={e => setForm({...form, color: e.target.value})}
                    style={{ width: '44px', height: '40px', padding: '2px', cursor: 'pointer', borderRadius: '8px', border: '1.5px solid var(--color-border)' }}
                  />
                  <input value={form.color} onChange={e => setForm({...form, color: e.target.value})} placeholder="#6366f1" style={{ flex: 1 }} />
                </div>
              </div>
            </div>

            {/* Stop assignment */}
            <div className="route-stops-section">
              <div className="route-stops-header">
                <label>Paragens da Rota</label>
                <span className="form-hint">{routeStops.length} paragens &middot; Arrasta para reordenar</span>
              </div>

              <div className="route-stops-add">
                <select
                  value=""
                  onChange={e => { addStop(e.target.value); e.target.value = ''; }}
                  disabled={availableStops.length === 0}
                >
                  <option value="">
                    {availableStops.length === 0 ? 'Todas as paragens adicionadas' : '+ Adicionar paragem...'}
                  </option>
                  {availableStops.map(s => (
                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                  ))}
                </select>
              </div>

              {routeStops.length === 0 ? (
                <div className="route-stops-empty">
                  Nenhuma paragem adicionada. Seleciona paragens acima.
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
                        <button type="button" className="route-stop-btn" onClick={() => moveStop(idx, idx - 1)} disabled={idx === 0} title="Subir">&#9650;</button>
                        <button type="button" className="route-stop-btn" onClick={() => moveStop(idx, idx + 1)} disabled={idx === routeStops.length - 1} title="Descer">&#9660;</button>
                        <button type="button" className="route-stop-btn route-stop-btn--remove" onClick={() => removeStop(idx)} title="Remover">&#10005;</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">{editing ? 'Guardar' : 'Criar'}</button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '70px' }}>ID</th>
              <th style={{ width: '110px' }}>Codigo</th>
              <th>Nome</th>
              <th style={{ width: '130px' }}>Cor</th>
              <th style={{ width: '100px' }}>Paragens</th>
              <th style={{ width: '170px' }}>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(route => (
              <tr key={route.id}>
                <td><span className="count-badge">{route.id}</span></td>
                <td><code style={{ fontSize: 13, fontWeight: 700, color: route.color || 'var(--color-primary)' }}>{route.code}</code></td>
                <td><strong>{route.name}</strong></td>
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
                      <button className="btn btn-sm" onClick={() => startEdit(route)}>Editar</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(route.id)}>Apagar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="6" className="empty">
                {search ? 'Nenhuma rota encontrada' : 'Nenhuma rota registada'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
