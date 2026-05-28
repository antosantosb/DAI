import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import BusCard from '../components/BusCard';
import BusDetailPanel from '../components/BusDetailPanel';
import './Buses.css';

export default function Buses() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  // Sprint 1 follow-up: developer faz tudo que admin faz na pagina Buses
  // (incl. bulk select, criar bus, descomissionar). Usamos `canManage` em
  // vez de `isAdmin` para os controlos de gestao.
  const isAdmin = hasRole('admin');
  const isDeveloper = hasRole('developer');
  const canManage = isAdmin || isDeveloper;
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [telemetry, setTelemetry] = useState({});
  const [drivers, setDrivers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [selectedBus, setSelectedBus] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ busCode: '', licensePlate: '', capacity: '', routeId: '' });
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState({ open: false });
  const [showBatch, setShowBatch] = useState(false);
  const [batchCount, setBatchCount] = useState('5');
  const [batchLoading, setBatchLoading] = useState(false);
  // Sprint 1 follow-up: modo selecao + bulk actions
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Toggle do modo selecao. Sair sempre limpa selecao.
  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      const next = !prev;
      if (!next) setSelectedIds(new Set());
      return next;
    });
  };

  const showModal = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  const load = useCallback(() => {
    api.get('/buses').then(r => setBuses(r.data || [])).catch(() => setBuses([]));
    api.get('/routes').then(r => setRoutes(r.data || [])).catch(() => setRoutes([]));
    api.get('/drivers').then(r => setDrivers(r.data || [])).catch(() => setDrivers([]));
  }, []);

  const loadTelemetry = useCallback(() => {
    api.get('/telemetry/latest').then(r => {
      const map = {};
      (r.data || []).forEach(t => { map[t.busId] = t; });
      setTelemetry(map);
    }).catch(() => {});
  }, []);

  const loadUnreadCounts = useCallback(() => {
    api.get('/despacho/unread-counts')
      .then(r => setUnreadCounts(r.data || {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadTelemetry();
    loadUnreadCounts();
    const interval = setInterval(() => {
      loadTelemetry();
      loadUnreadCounts();
    }, 5000);
    return () => clearInterval(interval);
  }, [load, loadTelemetry, loadUnreadCounts]);

  // Lookup: driverId atribuído a cada bus
  const driverByBusId = {};
  drivers.forEach(d => {
    if (d.currentBusId) driverByBusId[d.currentBusId] = d;
  });

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
      showModal({ type: 'success', title: t('toasts.successGeneric'), message: editing ? t('pages.buses.updateSuccess') : t('pages.buses.createSuccess') });
    }).catch(err => {
      showModal({ type: 'danger', title: t('toasts.errorGeneric'), message: err.response?.data?.message || err.message });
    });
  };

  const startEdit = (bus) => {
    if (bus.routeId && bus.status !== 'STOPPED') {
      showModal({ type: 'warning', title: t('pages.buses.actionUnavailable'), message: t('pages.buses.mustBeStoppedToEdit') });
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
      title: t('pages.buses.stopConfirmTitle', { code: bus.busCode }),
      message: t('pages.buses.stopConfirmMessage'),
      confirmText: t('pages.buses.stopConfirmAction'),
      onConfirm: () => {
        closeModal();
        api.patch(`/buses/${bus.id}`, { status: 'STOPPING' }).then(load);
      },
    });
  };

  const handleActivate = (bus) => {
    api.patch(`/buses/${bus.id}`, { status: 'ACTIVE' }).then(load);
  };

  const handleBatch = () => {
    const n = parseInt(batchCount);
    if (!n || n < 1 || n > 50) {
      showModal({ type: 'warning', title: t('pages.buses.batchInvalidTitle'), message: t('pages.buses.batchInvalidMessage') });
      return;
    }
    setBatchLoading(true);
    api.post(`/buses/batch?count=${n}`)
      .then(() => {
        setShowBatch(false);
        setBatchCount('5');
        load();
        showModal({ type: 'success', title: t('toasts.successGeneric'), message: t('pages.buses.batchSuccess', { count: n }) });
      })
      .catch(err => {
        showModal({ type: 'danger', title: t('toasts.errorGeneric'), message: err.response?.data?.message || err.message });
      })
      .finally(() => setBatchLoading(false));
  };

  const handleDecommission = (bus) => {
    if (bus.routeId && bus.status !== 'STOPPED') {
      showModal({ type: 'warning', title: t('pages.buses.actionUnavailable'), message: t('pages.buses.mustBeStoppedToDecommission') });
      return;
    }
    showModal({
      type: 'danger',
      title: t('pages.buses.decommissionConfirmTitle', { code: bus.busCode }),
      message: t('pages.buses.decommissionConfirmMessage'),
      confirmText: t('pages.buses.decommissionConfirmAction'),
      onConfirm: () => {
        closeModal();
        api.delete(`/buses/${bus.id}`).then(load);
      },
    });
  };

  // ─── Bulk select helpers ────────────────────────────────────────────────
  const toggleSelection = (busId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(busId)) next.delete(busId); else next.add(busId);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectVisible = (visibleBuses) => {
    setSelectedIds(new Set(visibleBuses.map((b) => b.id)));
  };

  // Acoes bulk: Promise.allSettled para nao bloquear se uma falha.
  const runBulk = async (ids, fn, successKey, errorKey) => {
    setBulkLoading(true);
    const results = await Promise.allSettled(ids.map(fn));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const ko = results.length - ok;
    await load();
    clearSelection();
    setSelectionMode(false);
    setBulkLoading(false);
    if (ko === 0) {
      showModal({ type: 'success', title: t('toasts.successGeneric'),
        message: t(successKey, { count: ok }) });
    } else {
      showModal({ type: 'warning', title: t('toasts.errorGeneric'),
        message: t(errorKey, { ok, ko }) });
    }
  };

  const handleBulkStart = () => {
    const ids = Array.from(selectedIds);
    const candidates = buses.filter((b) => ids.includes(b.id) && b.status !== 'ACTIVE');
    if (candidates.length === 0) {
      showModal({ type: 'info', title: t('pages.buses.bulkNoEligibleTitle'),
        message: t('pages.buses.bulkStartNoEligible') });
      return;
    }
    runBulk(candidates.map((b) => b.id),
      (id) => api.patch(`/buses/${id}`, { status: 'ACTIVE' }),
      'pages.buses.bulkStartSuccess', 'pages.buses.bulkPartial');
  };

  const handleBulkStop = () => {
    const ids = Array.from(selectedIds);
    const candidates = buses.filter((b) => ids.includes(b.id) && b.status === 'ACTIVE');
    if (candidates.length === 0) {
      showModal({ type: 'info', title: t('pages.buses.bulkNoEligibleTitle'),
        message: t('pages.buses.bulkStopNoEligible') });
      return;
    }
    runBulk(candidates.map((b) => b.id),
      (id) => api.patch(`/buses/${id}`, { status: 'STOPPING' }),
      'pages.buses.bulkStopSuccess', 'pages.buses.bulkPartial');
  };

  const handleBulkDecommission = () => {
    const ids = Array.from(selectedIds);
    const blocked = buses.filter((b) => ids.includes(b.id) && b.status !== 'STOPPED');
    if (blocked.length > 0) {
      showModal({ type: 'warning', title: t('pages.buses.actionUnavailable'),
        message: t('pages.buses.bulkDecommissionBlocked', { count: blocked.length }) });
      return;
    }
    showModal({
      type: 'danger',
      title: t('pages.buses.bulkDecommissionTitle', { count: ids.length }),
      message: t('pages.buses.bulkDecommissionMessage', { count: ids.length }),
      confirmText: t('pages.buses.decommissionConfirmAction'),
      onConfirm: () => {
        closeModal();
        runBulk(ids,
          (id) => api.delete(`/buses/${id}`),
          'pages.buses.bulkDecommissionSuccess', 'pages.buses.bulkPartial');
      },
    });
  };

  // Roteador de ações vindas do BusDetailPanel
  const handlePanelAction = (action, bus) => {
    if (action === 'stop')         handleStop(bus);
    else if (action === 'activate') handleActivate(bus);
    else if (action === 'edit')     { startEdit(bus); setSelectedBus(null); }
    else if (action === 'decommission') handleDecommission(bus);
  };

  const getStatusInfo = (bus) => {
    const tel = telemetry[bus.busCode];
    if (bus.status === 'STOPPED') return { label: t('pages.buses.liveStatusStopped'), cls: 'stopped', icon: '&#9632;' };
    if (bus.status === 'STOPPING') {
      if (tel && tel.status === 'stopped') return { label: t('pages.buses.liveStatusStoppingAtStop'), cls: 'stopping-at-stop', icon: '&#9679;' };
      return { label: t('pages.buses.liveStatusStopping'), cls: 'stopping', icon: '&#9888;' };
    }
    if (!tel) return { label: t('pages.buses.liveStatusNoData'), cls: 'unknown', icon: '?' };
    if (tel.status === 'stopped') return { label: t('pages.buses.liveStatusAtStop'), cls: 'at-stop', icon: '&#9679;' };
    return { label: t('pages.buses.liveStatusActive'), cls: 'active', icon: '&#9654;' };
  };

  const filtered = buses
    .filter(bus => {
      if (filter === 'active') return bus.status !== 'STOPPED';
      if (filter === 'stopped') return bus.status === 'STOPPED';
      return true;
    })
    .filter(bus => {
      if (!search) return true;
      const s = search.toLowerCase();
      return bus.busCode?.toLowerCase().includes(s) ||
             bus.licensePlate?.toLowerCase().includes(s) ||
             bus.routeCode?.toLowerCase().includes(s);
    })
    .sort((a, b) => {
      const aStoped = a.status === 'STOPPED' ? 1 : 0;
      const bStoped = b.status === 'STOPPED' ? 1 : 0;
      if (aStoped !== bStoped) return aStoped - bStoped;
      return (a.busCode || '').localeCompare(b.busCode || '');
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
          <h1>{t('pages.buses.title')}</h1>
          <p className="page-subtitle">{t('pages.buses.subtitle', { count: buses.length })}</p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn ${selectionMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={toggleSelectionMode}
            >
              {selectionMode ? t('pages.buses.bulkExit') : t('pages.buses.bulkEnter')}
            </button>
            {/* Sprint 1 follow-up: batch generation foi movido para a conta
                `developer` (Ferramentas Dev). Botao removido aqui — admin
                ja nao consegue gerar batches diretamente. */}
            <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }} disabled={selectionMode}>
              {t('pages.buses.newButton')}
            </button>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="bus-quick-stats">
        <div className="quick-stat">
          <span className="quick-stat-dot quick-stat-dot--active"></span>
          <span className="quick-stat-label">{t('pages.buses.activeCount', { count: activeCount })}</span>
        </div>
        <div className="quick-stat">
          <span className="quick-stat-dot quick-stat-dot--stopped"></span>
          <span className="quick-stat-label">{t('pages.buses.stoppedCount', { count: stoppedCount })}</span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bus-toolbar">
        <div className="search-bar">
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            placeholder={t('pages.buses.searchPlaceholderFull')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="bus-filters">
          <button className={`btn btn-filter${filter === 'all' ? ' btn-filter--active' : ''}`} onClick={() => setFilter('all')}>
            {t('pages.buses.filterAll', { count: buses.length })}
          </button>
          <button className={`btn btn-filter${filter === 'active' ? ' btn-filter--active' : ''}`} onClick={() => setFilter('active')}>
            {t('pages.buses.filterActive', { count: buses.length - stoppedCount })}
          </button>
          <button className={`btn btn-filter${filter === 'stopped' ? ' btn-filter--active' : ''}`} onClick={() => setFilter('stopped')}>
            {t('pages.buses.filterStopped', { count: stoppedCount })}
          </button>
        </div>
      </div>

      {showBatch && (
        <div className="form-overlay">
          <div className="form-card">
            <h3>{t('pages.buses.batchTitle')}</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', margin: '0 0 16px' }}>
              {t('pages.buses.batchDescription')}
            </p>
            <div className="form-group">
              <label>{t('pages.buses.batchQuantity')}</label>
              <input
                type="number"
                min="1"
                max="50"
                value={batchCount}
                onChange={e => setBatchCount(e.target.value)}
              />
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleBatch} disabled={batchLoading}>
                {batchLoading ? t('pages.buses.batchCreating') : t('pages.buses.batchCreateLabel', { count: batchCount || '?' })}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowBatch(false)} disabled={batchLoading}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="form-overlay">
          <form className="form-card" onSubmit={handleSubmit}>
            <h3>{editing ? t('pages.buses.edit') : t('pages.buses.create')}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('pages.buses.code')}</label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">TUB-</span>
                  <input value={form.busCode} onChange={e => handleBusCodeChange(e.target.value)} onBlur={handleBusCodeBlur} placeholder={t('pages.buses.codePlaceholder')} required />
                </div>
                {form.busCode && <span className="form-hint">{t('pages.buses.codeResult', { value: formatBusCode(form.busCode) })}</span>}
              </div>
              <div className="form-group">
                <label>{t('pages.buses.licensePlate')}</label>
                <input value={form.licensePlate} onChange={e => setForm({...form, licensePlate: formatPlate(e.target.value)})} placeholder="AA-00-AA" maxLength={8} required />
                <span className="form-hint">{t('pages.buses.licensePlateFormat')}</span>
              </div>
              <div className="form-group">
                <label>{t('pages.buses.capacity')}</label>
                <input type="number" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>{t('pages.buses.route')}</label>
                <select value={form.routeId} onChange={e => setForm({...form, routeId: e.target.value})}>
                  <option value="">{t('pages.buses.noRoute')}</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.code} - {r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">{editing ? t('common.save') : t('common.create')}</button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>{t('common.cancel')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Sprint 1 follow-up: action bar so visivel em modo selecao */}
      {canManage && selectionMode && (
        <div className="bulk-bar bulk-bar--visible">
          <div className="bulk-bar-left">
            <span className="bulk-bar-count">
              {t('pages.buses.bulkSelected', { count: selectedIds.size })}
            </span>
            <button
              type="button"
              className="bulk-bar-link"
              onClick={() => selectVisible(filtered)}
              disabled={bulkLoading}
            >
              {t('pages.buses.bulkSelectVisible', { count: filtered.length })}
            </button>
            <button
              type="button"
              className="bulk-bar-link"
              onClick={clearSelection}
              disabled={bulkLoading || selectedIds.size === 0}
            >
              {t('pages.buses.bulkClear')}
            </button>
          </div>
          <div className="bulk-bar-actions">
            <button className="btn btn-sm btn-success" onClick={handleBulkStart} disabled={bulkLoading || selectedIds.size === 0}>
              {t('pages.buses.bulkStart')}
            </button>
            <button className="btn btn-sm btn-warning" onClick={handleBulkStop} disabled={bulkLoading || selectedIds.size === 0}>
              {t('pages.buses.bulkStop')}
            </button>
            <button className="btn btn-sm btn-danger" onClick={handleBulkDecommission} disabled={bulkLoading || selectedIds.size === 0}>
              {t('pages.buses.bulkDecommission')}
            </button>
            <button className="btn btn-sm btn-secondary" onClick={toggleSelectionMode} disabled={bulkLoading}>
              {t('pages.buses.bulkExit')}
            </button>
          </div>
        </div>
      )}

      <div className="bus-grid">
        {filtered.map((bus, idx) => (
          <BusCard
            key={bus.id}
            bus={bus}
            driver={driverByBusId[bus.id]}
            unreadCount={unreadCounts[bus.busCode] || 0}
            onClick={() => setSelectedBus(bus)}
            animationDelay={idx * 0.04}
            selectionMode={selectionMode}
            selected={selectedIds.has(bus.id)}
            onToggleSelect={toggleSelection}
          />
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">&#128653;</div>
            <div className="empty-state-text">
              {search ? t('pages.buses.notFound') : t('pages.buses.noBuses')}
            </div>
          </div>
        )}
      </div>

      {/* Painel de detalhe + chat — abre ao clicar num card */}
      {selectedBus && (
        <BusDetailPanel
          bus={buses.find(b => b.id === selectedBus.id) || selectedBus}
          driver={driverByBusId[selectedBus.id]}
          telemetry={telemetry[selectedBus.busCode]}
          isAdmin={canManage}
          onClose={() => { setSelectedBus(null); loadUnreadCounts(); }}
          onAction={handlePanelAction}
        />
      )}
    </div>
  );
}
