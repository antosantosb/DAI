import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import BusCard from '../components/BusCard';
import BusDetailPanel from '../components/BusDetailPanel';
import BusScheduleModal from '../components/BusScheduleModal';
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
  const [sensors, setSensors] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [selectedBus, setSelectedBus] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ busCode: '', licensePlate: '', capacity: '' });
  const [showForm, setShowForm] = useState(false);
  // Pre-preenche a pesquisa a partir de ?q= no URL (deep-link vindo, p.ex., do
  // painel de detalhe do sensor: "Ver autocarro"). Aditivo: sem ?q= comporta-se na boa.
  const [search, setSearch] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') || '';
  });
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState({ open: false });
  const [showBatch, setShowBatch] = useState(false);
  const [batchCount, setBatchCount] = useState('5');
  const [batchLoading, setBatchLoading] = useState(false);
  // Sprint 1 follow-up: modo selecao + bulk actions
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  // Fase E (E-front-1): planeamento de escala (cascata linha->padrao->data->trips).
  const [scheduleModal, setScheduleModal] = useState({ open: false, bus: null });
  const [scheduleRefresh, setScheduleRefresh] = useState(0);

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
    // Main sensor (gateway de telematica) por autocarro. O bus DTO nao traz o
    // sensor, por isso buscamos o inventario e fazemos o lookup por busId,
    // espelhando o que ja' fazemos com os motoristas (driverByBusId).
    api.get('/sensors').then(r => setSensors(Array.isArray(r.data) ? r.data : [])).catch(() => setSensors([]));
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

  // Lookup: main sensor atribuído a cada bus (busId -> sensor).
  const sensorByBusId = {};
  sensors.forEach(s => {
    if (s.busId != null) sensorByBusId[s.busId] = s;
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
    setForm({
      busCode: '', licensePlate: '', capacity: '',
      // Sprint 4 (3.2): powertrain + campos condicionais
      powertrain: 'DIESEL',
      fuelTankL: '', adblueTankL: '',
      batteryKwh: '', chargingType: 'SLOW',
      cngTankKg: '', cngNominalBar: '',
    });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const pt = form.powertrain || 'DIESEL';
    const payload = {
      busCode: formatBusCode(form.busCode),
      licensePlate: form.licensePlate,
      capacity: parseInt(form.capacity),
      // routeId removido: a linha vem da escala/trip, ja' nao e' propriedade do bus.
      // Sprint 4 (3.2): powertrain + so' os campos relevantes ao tipo escolhido.
      powertrain: pt,
      fuelTankL:     pt === 'DIESEL'   && form.fuelTankL     ? Number(form.fuelTankL)     : null,
      adblueTankL:   pt === 'DIESEL'   && form.adblueTankL   ? Number(form.adblueTankL)   : null,
      batteryKwh:    pt === 'ELECTRIC' && form.batteryKwh    ? Number(form.batteryKwh)    : null,
      chargingType:  pt === 'ELECTRIC' ? (form.chargingType || 'SLOW') : null,
      cngTankKg:     pt === 'CNG'      && form.cngTankKg     ? Number(form.cngTankKg)     : null,
      cngNominalBar: pt === 'CNG'      && form.cngNominalBar ? Number(form.cngNominalBar) : null,
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
      // Sprint 4 (3.2): pre-popular powertrain + campos condicionais.
      powertrain:    bus.powertrain    || 'DIESEL',
      fuelTankL:     bus.fuelTankL     ?? '',
      adblueTankL:   bus.adblueTankL   ?? '',
      batteryKwh:    bus.batteryKwh    ?? '',
      chargingType:  bus.chargingType  || 'SLOW',
      cngTankKg:     bus.cngTankKg     ?? '',
      cngNominalBar: bus.cngNominalBar ?? '',
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

  // Remover a escala do dia para um autocarro. So' valido com bus STOPPED.
  // Usa o modal generico do projeto (igual a Descomissionar), nao window.confirm.
  const handleRemoveSchedule = (bus) => {
    const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' });
    showModal({
      type: 'danger',
      title: t('pages.buses.removeSchedule'),
      message: t('pages.buses.removeScheduleConfirm'),
      confirmText: t('pages.buses.removeSchedule'),
      onConfirm: async () => {
        closeModal();
        try {
          await api.delete(`/buses/${bus.id}/duties`, { params: { date: todayISO } });
          await load();
          setSelectedBus(null);
          showModal({ type: 'success', title: t('toasts.successGeneric'), message: t('pages.buses.removeSchedule') });
        } catch (err) {
          showModal({
            type: 'warning',
            title: t('toasts.errorGeneric'),
            message: err?.response?.data?.message || err?.message || t('toasts.operationFailed'),
          });
        }
      },
    });
  };

  const handleDecommission = (bus) => {
    // So' permite descomissionar se o autocarro estiver STOPPED (parado).
    // Estados EM_SERVICO/STOPPING bloqueados; DECOMMISSIONED ja terminal.
    if (bus.status !== 'STOPPED') {
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
    // Refresh: o painel acabou de mudar algo (ex.: unassign motorista/sensor)
    // e precisa que a lista volte a buscar dados frescos.
    else if (action === 'refresh') { load(); }
    else if (action === 'decommission') handleDecommission(bus);
    else if (action === 'removeSchedule') handleRemoveSchedule(bus);
    else if (action === 'planSchedule') {
      // Fase E (E-front-1): so' STOPPED pode receber uma nova escala.
      if (bus.status !== 'STOPPED') {
        showModal({ type: 'warning', title: t('pages.buses.actionUnavailable'), message: t('pages.buses.planScheduleTooltip') });
        return;
      }
      setScheduleModal({ open: true, bus });
    }
  };

  const closeScheduleModal = () => setScheduleModal({ open: false, bus: null });
  const onScheduleCreated = (duties) => {
    setScheduleRefresh(k => k + 1);
    load();
    showModal({
      type: 'success',
      title: t('toasts.successGeneric'),
      message: t('pages.buses.scheduleCreatedSuccess', { count: (duties || []).length }),
    });
  };
  const onScheduleError = (msg) => {
    showModal({ type: 'danger', title: t('toasts.errorGeneric'), message: msg });
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
      // O filtro "decommissioned" e o UNICO que mostra autocarros descomissionados.
      // Os outros (all/active/stopped) excluem-nos sempre.
      if (filter === 'decommissioned') return bus.status === 'DECOMMISSIONED';
      if (bus.status === 'DECOMMISSIONED') return false;
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

  const activeCount = buses.filter(b => b.status === 'ACTIVE' || b.status === 'EM_SERVICO' || b.status === 'STOPPING').length;
  const stoppingCount = buses.filter(b => b.status === 'STOPPING').length;
  const stoppedCount = buses.filter(b => b.status === 'STOPPED').length;
  const decommissionedCount = buses.filter(b => b.status === 'DECOMMISSIONED').length;
  // Total visivel exclui DECOMMISSIONED (so' aparecem no filtro proprio).
  const visibleTotal = buses.length - decommissionedCount;

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
            {t('pages.buses.filterAll', { count: visibleTotal })}
          </button>
          <button className={`btn btn-filter${filter === 'active' ? ' btn-filter--active' : ''}`} onClick={() => setFilter('active')}>
            {t('pages.buses.filterActive', { count: activeCount })}
          </button>
          <button className={`btn btn-filter${filter === 'stopped' ? ' btn-filter--active' : ''}`} onClick={() => setFilter('stopped')}>
            {t('pages.buses.filterStopped', { count: stoppedCount })}
          </button>
          <button className={`btn btn-filter${filter === 'decommissioned' ? ' btn-filter--active' : ''}`} onClick={() => setFilter('decommissioned')}>
            {t('pages.buses.filterDecommissioned', { count: decommissionedCount })}
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
              {/* "Linha" deixou de ser propriedade do autocarro. A linha vem
                  da escala/trip atribuida (ver "Planear escala"). */}

              {/* Sprint 4 (3.2): selector de powertrain + campos condicionais. */}
              <div className="form-group">
                <label>{t('pages.buses.powertrain', 'Tipo de motor')}</label>
                <select
                  value={form.powertrain || 'DIESEL'}
                  onChange={e => setForm({ ...form, powertrain: e.target.value })}
                  required
                >
                  <option value="DIESEL">{t('pages.buses.ptDiesel', 'Gasóleo (DIESEL)')}</option>
                  <option value="ELECTRIC">{t('pages.buses.ptElectric', 'Eléctrico (ELECTRIC)')}</option>
                  <option value="CNG">{t('pages.buses.ptCng', 'Gás Natural (CNG)')}</option>
                </select>
                <span className="form-hint">
                  {t('pages.buses.powertrainHint', 'Define os atributos físicos do autocarro e a telemetria que o simulador gera.')}
                </span>
              </div>

              {form.powertrain === 'DIESEL' && (
                <>
                  <div className="form-group">
                    <label>{t('pages.buses.fuelTankL', 'Depósito de gasóleo (L)')}</label>
                    <input type="number" step="0.1" min="0" value={form.fuelTankL || ''}
                      onChange={e => setForm({ ...form, fuelTankL: e.target.value })}
                      placeholder="ex: 280" />
                  </div>
                  <div className="form-group">
                    <label>{t('pages.buses.adblueTankL', 'Depósito AdBlue (L)')}</label>
                    <input type="number" step="0.1" min="0" value={form.adblueTankL || ''}
                      onChange={e => setForm({ ...form, adblueTankL: e.target.value })}
                      placeholder="ex: 30" />
                    <span className="form-hint">{t('pages.buses.adblueHint', 'Apenas Euro 6 (SCR/NOx).')}</span>
                  </div>
                </>
              )}

              {form.powertrain === 'ELECTRIC' && (
                <>
                  <div className="form-group">
                    <label>{t('pages.buses.batteryKwh', 'Capacidade da bateria (kWh)')}</label>
                    <input type="number" step="0.1" min="0" value={form.batteryKwh || ''}
                      onChange={e => setForm({ ...form, batteryKwh: e.target.value })}
                      placeholder="ex: 281" />
                  </div>
                  <div className="form-group">
                    <label>{t('pages.buses.chargingType', 'Tipo de carregamento')}</label>
                    <select value={form.chargingType || 'SLOW'}
                      onChange={e => setForm({ ...form, chargingType: e.target.value })}>
                      <option value="SLOW">{t('pages.buses.chargeSlow', 'Lento (depósito)')}</option>
                      <option value="FAST">{t('pages.buses.chargeFast', 'Rápido')}</option>
                      <option value="OPPORTUNITY">{t('pages.buses.chargeOpp', 'Oportunidade (pantograph)')}</option>
                    </select>
                  </div>
                </>
              )}

              {form.powertrain === 'CNG' && (
                <>
                  <div className="form-group">
                    <label>{t('pages.buses.cngTankKg', 'Capacidade do tanque CNG (kg)')}</label>
                    <input type="number" step="0.1" min="0" value={form.cngTankKg || ''}
                      onChange={e => setForm({ ...form, cngTankKg: e.target.value })}
                      placeholder="ex: 160" />
                  </div>
                  <div className="form-group">
                    <label>{t('pages.buses.cngNominalBar', 'Pressão nominal (bar)')}</label>
                    <input type="number" step="0.1" min="0" value={form.cngNominalBar || ''}
                      onChange={e => setForm({ ...form, cngNominalBar: e.target.value })}
                      placeholder="ex: 200" />
                  </div>
                </>
              )}
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
        {filtered.map((bus, idx) => {
          const isDecommissioned = bus.status === 'DECOMMISSIONED';
          return (
            <BusCard
              key={bus.id}
              bus={bus}
              driver={driverByBusId[bus.id]}
              unreadCount={unreadCounts[bus.busCode] || 0}
              // Descomissionado: abre uma vista minima so' com codigo/matricula/capacidade.
              onClick={() => setSelectedBus(bus)}
              animationDelay={idx * 0.04}
              selectionMode={selectionMode && !isDecommissioned}
              selected={selectedIds.has(bus.id)}
              onToggleSelect={toggleSelection}
            />
          );
        })}
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 6v6" />
                <path d="M15 6v6" />
                <path d="M2 12h19.6" />
                <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
                <circle cx="7" cy="18" r="2" />
                <path d="M9 18h5" />
                <circle cx="16" cy="18" r="2" />
              </svg>
            </div>
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
          sensor={sensorByBusId[selectedBus.id]}
          telemetry={telemetry[selectedBus.busCode]}
          isAdmin={canManage}
          onClose={() => { setSelectedBus(null); loadUnreadCounts(); }}
          onAction={handlePanelAction}
          scheduleRefreshKey={scheduleRefresh}
        />
      )}

      {/* Fase E (E-front-1): modal de planeamento de escala */}
      <BusScheduleModal
        open={scheduleModal.open}
        bus={scheduleModal.bus}
        onClose={closeScheduleModal}
        onCreated={onScheduleCreated}
        onError={onScheduleError}
      />
    </div>
  );
}
