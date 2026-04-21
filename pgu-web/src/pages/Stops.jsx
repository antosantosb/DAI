import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';

export default function Stops() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [stops, setStops] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', maxBusesDisplay: 3, panelMessage: '', latitude: '', longitude: '' });
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

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
       .catch(err => alert('Erro: ' + (err.response?.data?.message || err.message)));
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
    if (!confirm('Tens a certeza que queres apagar esta paragem?')) return;
    api.delete(`/stops/${id}`).then(load);
  };

  const filtered = stops.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Paragens</h1>
          <p className="page-subtitle">{stops.length} paragens registadas</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
            + Nova Paragem
          </button>
        )}
      </div>

      <div className="bus-toolbar" style={{ marginBottom: 20 }}>
        <div className="search-bar">
          <span className="search-bar-icon">&#128269;</span>
          <input
            placeholder="Pesquisar paragem..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {showForm && (
        <div className="form-overlay">
          <form className="form-card" onSubmit={handleSubmit}>
            <h3>{editing ? 'Editar Paragem' : 'Nova Paragem'}</h3>
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
                <label>Max Autocarros no Painel</label>
                <input type="number" min="1" max="10" value={form.maxBusesDisplay} onChange={e => setForm({...form, maxBusesDisplay: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Mensagem do Painel</label>
                <input value={form.panelMessage} onChange={e => setForm({...form, panelMessage: e.target.value})} placeholder="Opcional" />
              </div>
              <div className="form-group">
                <label>Latitude</label>
                <input type="number" step="any" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} required={!editing} />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input type="number" step="any" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} required={!editing} />
              </div>
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
              <th>Nome</th>
              <th style={{ width: '110px' }}>Codigo</th>
              <th style={{ width: '80px' }}>Painel</th>
              <th style={{ width: '150px' }}>Mensagem</th>
              <th style={{ width: '130px' }}>Latitude</th>
              <th style={{ width: '130px' }}>Longitude</th>
              <th style={{ width: '170px' }}>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(stop => (
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
                      <button className="btn btn-sm" onClick={() => startEdit(stop)}>Editar</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(stop.id)}>Apagar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="8" className="empty">
                {search ? 'Nenhuma paragem encontrada' : 'Nenhuma paragem registada'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
