import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import './Drivers.css';

export default function Drivers() {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState([]);
  const [allBuses, setAllBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignModal, setAssignModal] = useState({ open: false, driver: null });
  const [assignSearch, setAssignSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  // Sprint 1 follow-up: search + filter por status
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Batch creation
  const [showBatch, setShowBatch] = useState(false);
  const [batchCount, setBatchCount] = useState('5');
  const [batchLoading, setBatchLoading] = useState(false);
  const [modal, setModal] = useState({ open: false });
  const showModal = (opts) => setModal({ open: true, ...opts });

  const fetchData = async () => {
    try {
      const [driversRes, busesRes] = await Promise.all([
        api.get('/drivers'),
        api.get('/buses'),
      ]);
      setDrivers(driversRes.data || []);
      setAllBuses(busesRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Lista de buses disponíveis para atribuir (não ACTIVE e sem motorista atual)
  const busesAlreadyAssigned = new Set(
    drivers.map(d => d.currentBusId).filter(Boolean)
  );
  // Descomissionados nao sao operacionais; nunca aparecem na lista de assign.
  const availableBuses = allBuses
    .filter(b => b.status !== 'DECOMMISSIONED')
    .filter(b => !busesAlreadyAssigned.has(b.id));

  // Sprint 1 follow-up: filtered list (search + status filter) para a tabela.
  const filteredDrivers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return drivers.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!q) return true;
      return [d.name, d.mechanographicNumber, d.phoneNumber, d.currentBusCode]
        .some((f) => (f || '').toLowerCase().includes(q));
    });
  }, [drivers, search, statusFilter]);

  // Counts por status para os filtros
  const counts = useMemo(() => ({
    all: drivers.length,
    ON_DUTY: drivers.filter(d => d.status === 'ON_DUTY').length,
    AVAILABLE: drivers.filter(d => d.status === 'AVAILABLE').length,
    OFFLINE: drivers.filter(d => d.status === 'OFFLINE').length,
  }), [drivers]);

  // Search filter sobre availableBuses (modal de assign)
  const filteredAssignBuses = useMemo(() => {
    if (!assignSearch.trim()) return availableBuses;
    const q = assignSearch.toLowerCase().trim();
    return availableBuses.filter(b =>
      (b.busCode || '').toLowerCase().includes(q) ||
      (b.routeCode || '').toLowerCase().includes(q) ||
      (b.routeName || '').toLowerCase().includes(q)
    );
  }, [availableBuses, assignSearch]);

  const handleAssign = async (driverId, busId) => {
    try {
      await api.post('/drivers/assign', { driverId, busId });
      setAssignModal({ open: false, driver: null });
      setAssignSearch('');
      await fetchData();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || t('pages.drivers.assignFailed'));
    }
  };

  const handleUnassign = async (driverId) => {
    try {
      await api.post('/drivers/unassign', { driverId });
      await fetchData();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || t('pages.drivers.unassignFailed'));
    }
  };

  const handleBatch = () => {
    const n = parseInt(batchCount);
    if (!n || n < 1 || n > 50) {
      showModal({
        type: 'warning',
        title: t('pages.drivers.batchInvalidTitle'),
        message: t('pages.drivers.batchInvalidMessage'),
      });
      return;
    }
    setBatchLoading(true);
    api.post(`/users/drivers/batch?count=${n}`)
      .then(res => {
        const createdCount = Array.isArray(res.data) ? res.data.length : n;
        setShowBatch(false);
        setBatchCount('5');
        fetchData();
        showModal({
          type: 'success',
          title: t('toasts.successGeneric'),
          message: t('pages.drivers.batchSuccess', { count: createdCount }),
        });
      })
      .catch(err => {
        showModal({
          type: 'danger',
          title: t('toasts.errorGeneric'),
          message: err.response?.data?.message || err.message,
        });
      })
      .finally(() => setBatchLoading(false));
  };

  if (loading) return <div className="empty-state">{t('pages.drivers.loadingDrivers')}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('pages.drivers.title')}</h1>
          <div className="page-subtitle">{t('pages.drivers.subtitleAlt')}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Sprint 1 follow-up: batch generation movido para "Ferramentas
              Dev" (conta developer). Admin ja nao gera motoristas em batch. */}
          <Link to="/backoffice/users" className="btn btn-primary">
            {t('pages.drivers.createInUsers')}
          </Link>
        </div>
      </div>

      {/* Sprint 1 follow-up: toolbar com search + filtros por status */}
      <div className="drivers-toolbar">
        <div className="search-bar">
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            placeholder={t('pages.drivers.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="user-filter-group" role="group" aria-label={t('pages.drivers.ariaFilterByStatus')}>
          <span className="user-filter-label">{t('pages.drivers.filterStatusLabel')}</span>
          {[
            { key: 'all',       label: t('pages.drivers.filterAll'),        count: counts.all },
            { key: 'ON_DUTY',   label: t('pages.drivers.statusOnDuty'),     count: counts.ON_DUTY },
            { key: 'AVAILABLE', label: t('pages.drivers.statusAvailable'),  count: counts.AVAILABLE },
            { key: 'OFFLINE',   label: t('pages.drivers.statusOffline'),    count: counts.OFFLINE },
          ].map(f => (
            <button
              key={f.key}
              className={`btn btn-filter btn-filter--sm${statusFilter === f.key ? ' btn-filter--active' : ''}`}
              onClick={() => setStatusFilter(f.key)}
              aria-pressed={statusFilter === f.key}
            >
              {`${f.label} (${f.count})`}
            </button>
          ))}
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('pages.drivers.headers.name')}</th>
              <th>{t('pages.drivers.headers.mechNumber')}</th>
              <th>{t('pages.drivers.headers.phone')}</th>
              <th>{t('pages.drivers.headers.status')}</th>
              <th>{t('pages.drivers.headers.currentBus')}</th>
              <th>{t('pages.drivers.headers.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredDrivers.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty">
                  {t('pages.drivers.noDriversRegistered')}{' '}
                  <Link to="/backoffice/users" className="inline-link">
                    {t('pages.drivers.createInUsersLink')}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                </td>
              </tr>
            ) : (
              filteredDrivers.map(driver => {
                const busStopped = driver.currentBusStatus === 'STOPPED';
                const busActive  = driver.currentBusStatus === 'ACTIVE';
                const busStopping = driver.currentBusStatus === 'STOPPING';
                // Sprint 1 follow-up: dot indicador do status do bus
                //   active   -> verde a piscar
                //   stopping -> amarelo a piscar
                //   stopped  -> cinzento estático
                const busDotClass = busActive
                  ? 'bus-dot bus-dot--active'
                  : busStopping
                    ? 'bus-dot bus-dot--stopping'
                    : 'bus-dot bus-dot--stopped';
                return (
                  <tr key={driver.id}>
                    <td>
                      <div className="driver-name-cell">
                        <Avatar url={driver.avatarUrl} name={driver.name} size="sm" />
                        <span>{driver.name}</span>
                      </div>
                    </td>
                    <td>{driver.mechanographicNumber}</td>
                    <td>{driver.phoneNumber || '-'}</td>
                    <td>
                      <span className={`driver-status driver-status--${driver.status === 'ON_DUTY' ? 'on-duty' : driver.status === 'AVAILABLE' ? 'available' : 'offline'}`}>
                        {driver.status === 'ON_DUTY' ? t('pages.drivers.statusOnDuty') : driver.status === 'AVAILABLE' ? t('pages.drivers.statusAvailable') : driver.status}
                      </span>
                    </td>
                    <td>
                      {driver.currentBusCode ? (
                        <span className="current-bus">
                          {driver.currentBusCode}
                          <span
                            className={busDotClass}
                            title={busActive
                              ? t('pages.drivers.busInProgress')
                              : busStopping
                                ? t('pages.drivers.busStopping')
                                : t('pages.drivers.busStopped')}
                          />
                        </span>
                      ) : <span style={{ color: '#94a3b8' }}>-</span>}
                    </td>
                    <td className="actions">
                      {driver.currentBusId ? (
                        <button
                          onClick={() => handleUnassign(driver.id)}
                          className="btn btn-unassign btn-sm"
                          disabled={!busStopped}
                          title={!busStopped ? t('pages.drivers.unassignDisabledTitle') : t('pages.drivers.unassignTitle')}
                        >
                          {t('pages.drivers.unassignAction')}
                        </button>
                      ) : (
                        <button
                          onClick={() => { setAssignSearch(''); setAssignModal({ open: true, driver }); }}
                          className="btn btn-primary btn-sm"
                          disabled={driver.status === 'OFFLINE'}
                          title={driver.status === 'OFFLINE' ? t('pages.drivers.assignDisabledOffline') : undefined}
                        >
                          {t('pages.drivers.assignBus')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de seleção de autocarro — grid 2-col + search + status pill */}
      {assignModal.open && (
        <Modal
          open
          title={t('pages.drivers.assignModalTitle', { name: assignModal.driver?.name })}
          onClose={() => { setAssignModal({ open: false, driver: null }); setAssignSearch(''); }}
        >
          {allBuses.length === 0 ? (
            <p className="assign-bus-empty">
              {t('pages.drivers.noBusesYet')} <Link to="/backoffice/buses" onClick={() => setAssignModal({ open: false, driver: null })}>{t('pages.drivers.busesLinkLabel')}</Link>.
            </p>
          ) : availableBuses.length === 0 ? (
            <p className="assign-bus-empty">
              {t('pages.drivers.allAssigned')}
            </p>
          ) : (
            <>
              <div className="assign-bus-search">
                <svg className="assign-bus-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  className="assign-bus-search-input"
                  placeholder={t('pages.drivers.assignSearch')}
                  value={assignSearch}
                  onChange={e => setAssignSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {filteredAssignBuses.length === 0 ? (
                <p className="assign-bus-empty">{t('pages.drivers.assignNoResults')}</p>
              ) : (
                <div className="assign-bus-grid">
                  {filteredAssignBuses.map(bus => {
                    const hasRoute = !!bus.routeCode;
                    return (
                      <button
                        key={bus.id}
                        className={`assign-bus-card${!hasRoute ? ' assign-bus-card--no-route' : ''}`}
                        onClick={() => handleAssign(assignModal.driver.id, bus.id)}
                      >
                        <span className="assign-bus-code">{bus.busCode}</span>
                        <span className="assign-bus-route">
                          {hasRoute ? (
                            <>
                              <span className="assign-bus-route-code">{bus.routeCode}</span>
                              <span className="assign-bus-route-name">{bus.routeName}</span>
                            </>
                          ) : (
                            <span className="assign-bus-pill assign-bus-pill--warning">{t('pages.drivers.noRoute')}</span>
                          )}
                        </span>
                        <span className={`assign-bus-pill assign-bus-pill--${bus.status === 'ACTIVE' ? 'success' : 'neutral'}`}>
                          {bus.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Modal batch — gerar motoristas em lote */}
      {showBatch && (
        <div className="form-overlay">
          <div className="form-card">
            <h3>{t('pages.drivers.batchTitle')}</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', margin: '0 0 16px' }}>
              {t('pages.drivers.batchDescription')}
            </p>
            <div className="form-group">
              <label>{t('pages.drivers.batchQuantity')}</label>
              <input
                type="number"
                min="1"
                max="50"
                value={batchCount}
                onChange={e => setBatchCount(e.target.value)}
              />
            </div>
            <div
              style={{
                background: 'var(--color-warning-light)',
                border: '1px solid var(--color-warning-light)',
                color: 'var(--color-warning-hover)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                fontSize: '13px',
                lineHeight: 1.5,
                marginBottom: '12px',
              }}
            >
              <strong>{t('pages.drivers.batchPasswordHintTitle')}</strong>{' '}
              {t('pages.drivers.batchPasswordHintBody')}
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleBatch} disabled={batchLoading}>
                {batchLoading ? t('pages.drivers.batchCreating') : t('pages.drivers.batchCreateLabel', { count: batchCount || '?' })}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowBatch(false)} disabled={batchLoading}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de info/success/warning/error (batch feedback) */}
      {modal.open && (
        <Modal open title={modal.title} onClose={() => setModal({ open: false })}>
          <p style={{ color: modal.type === 'danger' ? '#ef4444' : modal.type === 'warning' ? '#f59e0b' : 'inherit' }}>
            {modal.message}
          </p>
        </Modal>
      )}

      {/* Modal de erro (assign/unassign) */}
      {errorMsg && (
        <Modal open title={t('pages.drivers.errorTitle')} onClose={() => setErrorMsg(null)}>
          <p style={{ color: '#ef4444' }}>{errorMsg}</p>
        </Modal>
      )}
    </div>
  );
}
