import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import BusIcon from '../components/BusIcon';
import './Buses.css';

export default function Buses() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [telemetry, setTelemetry] = useState({});
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ busCode: '', licensePlate: '', capacity: '', routeId: '' });
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open: false });

  const showModal = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  const load = useCallback(() => {
    api.get('/buses').then(r => setBuses(r.data || [])).catch(() => setBuses([]));
    api.get('/routes').then(r => setRoutes(r.data || [])).catch(() => setRoutes([]));
  }, []);

  const loadTelemetry = useCallback(() => {
    api.get('/telemetry/latest').then(r => {
      const map = {};
      (r.data || []).forEach(t => { map[t.busId] = t; });
      setTelemetry(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadTelemetry();
    const interval = setInterval(loadTelemetry, 5000);
    return () => clearInterval(interval);
  }, [load, loadTelemetry]);

  const formatPlate = (raw) => {
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
    if (clean.length <= 2) return clean;
    if (clean.length <= 4) return clean.slice(0, 2) + '-' + clean.slice(2);
    return clean.slice(0, 2) + '-' + clean.slice(2, 4) + '-' + clean.slice(4);
  };

  const handleBusCodeChange = (val) => {
    const num = val.replace(/\D/g, '').slice(0, 3);
    setForm({ ...form, busCode: num });
  };

  const handleBusCodeBlur = () => {
    if (form.busCode) {
      setForm({ ...form, busCode: form.busCode.padStart(3, '0') });
    }
  };

  const formatBusCode = (raw) => {
    const num = raw.replace(/\D/g, '');
    return num ? 'TUB-' + num.padStart(3, '0') : '';
  };

  const resetForm = () => {
    setForm({ busCode: '', licensePlate: '', capacity: '', routeId: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      busCode: formatBusCode(form.busCode),
      licensePlate: form.licensePlate,
      capacity: parseInt(form.capacity),
      routeId: form.routeId ? parseInt(form.routeId) : null,
    };

    const req = editing
      ? api.patch(`/buses/${editing}`, payload)
      : api.post('/buses', payload);

    req.then(() => {
      resetForm();
      load();
      showModal({ type: 'success', title: 'Sucesso', message: editing ? 'Autocarro atualizado com sucesso.' : 'Autocarro criado com sucesso.' });
    }).catch(err => {
      showModal({ type: 'danger', title: 'Erro', message: err.response?.data?.message || err.message });
    });
  };

  const startEdit = (bus) => {
    if (bus.routeId && bus.status !== 'STOPPED') {
      showModal({ type: 'warning', title: 'Acao indisponivel', message: 'O autocarro tem de estar parado para ser editado.' });
      return;
    }
    setForm({
      busCode: bus.busCode.replace(/\D/g, ''),
      licensePlate: bus.licensePlate,
      capacity: bus.capacity,
      routeId: bus.routeId || '',
    });
    setEditing(bus.id);
    setShowForm(true);
  };

  const handleStop = (bus) => {
    showModal({
      type: 'warning',
      title: `Parar ${bus.busCode}?`,
      message: 'O autocarro vai completar a rota atual e parar no extremo. Podes cancelar a paragem a qualquer momento.',
      confirmText: 'Parar Autocarro',
      onConfirm: () => {
        closeModal();
        api.patch(`/buses/${bus.id}`, { status: 'STOPPING' }).then(load);
      },
    });
  };

  const handleActivate = (bus) => {
    api.patch(`/buses/${bus.id}`, { status: 'ACTIVE' }).then(load);
  };

  const handleDecommission = (bus) => {
    if (bus.routeId && bus.status !== 'STOPPED') {
      showModal({ type: 'warning', title: 'Acao indisponivel', message: 'O autocarro tem de estar parado para ser descomissionado.' });
      return;
    }
    showModal({
      type: 'danger',
      title: `Descomissionar ${bus.busCode}?`,
      message: 'O autocarro sera permanentemente removido do sistema. Esta acao nao pode ser revertida.',
      confirmText: 'Descomissionar',
      onConfirm: () => {
        closeModal();
        api.delete(`/buses/${bus.id}`).then(load);
      },
    });
  };

  const getStatusInfo = (bus) => {
    const t = telemetry[bus.busCode];
    if (bus.status === 'STOPPED') return { label: 'Parado', cls: 'stopped', icon: '&#9632;' };
    if (bus.status === 'STOPPING') return { label: 'A Parar', cls: 'stopping', icon: '&#9888;' };
    if (!t) return { label: 'Sem Dados', cls: 'unknown', icon: '?' };
    if (t.status === 'stopped') return { label: 'Em Paragem', cls: 'at-stop', icon: '&#9679;' };
    return { label: 'Em Viagem', cls: 'active', icon: '&#9654;' };
  };

  const filtered = buses.filter(bus => {
    if (!search) return true;
    const s = search.toLowerCase();
    return bus.busCode?.toLowerCase().includes(s) ||
           bus.licensePlate?.toLowerCase().includes(s) ||
           bus.routeCode?.toLowerCase().includes(s);
  });

  const activeCount = buses.filter(b => b.routeId && (b.status === 'ACTIVE' || b.status === 'STOPPING')).length;
  const stoppingCount = buses.filter(b => b.status === 'STOPPING').length;
  const stoppedCount = buses.filter(b => b.status === 'STOPPED').length;

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
        cancelText={modal.cancelText}
      />

      <div className="page-header">
        <div>
          <h1>Autocarros</h1>
          <p className="page-subtitle">{buses.length} autocarros registados</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
            + Novo Autocarro
          </button>
        )}
      </div>

      {/* Quick stats */}
      <div className="bus-quick-stats">
        <div className="quick-stat">
          <span className="quick-stat-dot quick-stat-dot--active"></span>
          <span className="quick-stat-label">{activeCount} ativos</span>
        </div>
        <div className="quick-stat">
          <span className="quick-stat-dot quick-stat-dot--stopped"></span>
          <span className="quick-stat-label">{stoppedCount} parados</span>
        </div>
      </div>

      {/* Search */}
      <div className="bus-toolbar">
        <div className="search-bar">
          <span className="search-bar-icon">&#128269;</span>
          <input
            placeholder="Pesquisar autocarro, matricula ou rota..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {showForm && (
        <div className="form-overlay">
          <form className="form-card" onSubmit={handleSubmit}>
            <h3>{editing ? 'Editar Autocarro' : 'Novo Autocarro'}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Codigo</label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">TUB-</span>
                  <input value={form.busCode} onChange={e => handleBusCodeChange(e.target.value)} onBlur={handleBusCodeBlur} placeholder="001" required />
                </div>
                {form.busCode && <span className="form-hint">Resultado: {formatBusCode(form.busCode)}</span>}
              </div>
              <div className="form-group">
                <label>Matricula</label>
                <input value={form.licensePlate} onChange={e => setForm({...form, licensePlate: formatPlate(e.target.value)})} placeholder="AA-00-AA" maxLength={8} required />
                <span className="form-hint">Formato: AA-00-AA</span>
              </div>
              <div className="form-group">
                <label>Capacidade</label>
                <input type="number" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Rota</label>
                <select value={form.routeId} onChange={e => setForm({...form, routeId: e.target.value})}>
                  <option value="">Sem rota</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.code} - {r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">{editing ? 'Guardar' : 'Criar'}</button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div className="bus-grid">
        {filtered.map((bus, idx) => {
          const t = telemetry[bus.busCode];
          const status = getStatusInfo(bus);
          const isActive = bus.status === 'ACTIVE';
          const isStopping = bus.status === 'STOPPING';
          const isStopped = bus.status === 'STOPPED';

          return (
            <div
              key={bus.id}
              className={`bus-card bus-card--${status.cls}`}
              style={{ animationDelay: `${idx * 0.04}s` }}
            >
              <div className="bus-card-header">
                <div className="bus-card-title">
                  <span className="bus-code">{bus.busCode}</span>
                  <span className="bus-route-tag">{bus.routeCode || 'Sem rota'}</span>
                </div>
                <BusIcon status={status.cls} />
              </div>

              <div className="bus-card-body">
                <div className="bus-meta">
                  <div className="bus-meta-item">
                    <span className="bus-meta-label">Matricula</span>
                    <span className="bus-meta-value">{bus.licensePlate || '-'}</span>
                  </div>
                  <div className="bus-meta-item">
                    <span className="bus-meta-label">Capacidade</span>
                    <span className="bus-meta-value">{bus.capacity || '-'}</span>
                  </div>
                </div>

                {t && !isStopped && (
                  <div className="bus-telemetry">
                    <div className="bus-telemetry-grid">
                      <div className="telem-item">
                        <span className="telem-value">{t.nextStop || '-'}</span>
                        <span className="telem-label">Proxima Paragem</span>
                      </div>
                      <div className="telem-item">
                        <span className="telem-value telem-value--num">{t.stopsRemaining != null ? t.stopsRemaining : '-'}</span>
                        <span className="telem-label">Restantes</span>
                      </div>
                      <div className="telem-item">
                        <span className="telem-value telem-value--num">{t.passengers}<span className="telem-unit">/{bus.capacity || '?'}</span></span>
                        <span className="telem-label">Passageiros</span>
                      </div>
                      <div className="telem-item">
                        <span className="telem-value telem-value--num">{t.speed?.toFixed(0) || '0'}<span className="telem-unit">km/h</span></span>
                        <span className="telem-label">Velocidade</span>
                      </div>
                    </div>
                    <div className="bus-last-update">
                      {t.timestamp ? new Date(t.timestamp).toLocaleTimeString('pt-PT') : '-'}
                    </div>
                  </div>
                )}
              </div>

              <div className="bus-card-footer">
                {isActive && bus.routeId && (
                  <button className="btn btn-warning btn-sm" onClick={() => handleStop(bus)}>
                    &#9632; Parar
                  </button>
                )}
                {isStopping && (
                  <button className="btn btn-secondary btn-sm" onClick={() => handleActivate(bus)}>
                    Cancelar Paragem
                  </button>
                )}
                {isStopped && (
                  <button className="btn btn-success btn-sm" onClick={() => handleActivate(bus)}>
                    &#9654; Ativar
                  </button>
                )}
                {isAdmin && (!bus.routeId || isStopped) && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(bus)}>
                      Editar
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDecommission(bus)}>
                      Descomissionar
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">&#128653;</div>
            <div className="empty-state-text">
              {search ? 'Nenhum autocarro encontrado' : 'Nenhum autocarro registado'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
