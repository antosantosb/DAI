import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Modal from '../components/Modal';
import './Drivers.css';

export default function Drivers() {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState([]);
  const [allBuses, setAllBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignModal, setAssignModal] = useState({ open: false, driver: null });
  const [errorMsg, setErrorMsg] = useState(null);

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
  const availableBuses = allBuses.filter(b => !busesAlreadyAssigned.has(b.id));

  const handleAssign = async (driverId, busId) => {
    try {
      await api.post('/drivers/assign', { driverId, busId });
      setAssignModal({ open: false, driver: null });
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

  if (loading) return <div className="empty-state">{t('pages.drivers.loadingDrivers')}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('pages.drivers.title')}</h1>
          <div className="page-subtitle">{t('pages.drivers.subtitleAlt')}</div>
        </div>
        <Link to="/backoffice/users" className="btn btn-primary">
          {t('pages.drivers.createInUsers')}
        </Link>
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
            {drivers.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty">
                  {t('pages.drivers.noDriversRegistered')} <Link to="/backoffice/users">{t('pages.drivers.createInUsersLink')}</Link>
                </td>
              </tr>
            ) : (
              drivers.map(driver => {
                const busActive = driver.currentBusStatus === 'ACTIVE';
                return (
                  <tr key={driver.id}>
                    <td>{driver.name}</td>
                    <td>{driver.mechanographicNumber}</td>
                    <td>{driver.phoneNumber || '—'}</td>
                    <td>
                      <span className={`driver-status driver-status--${driver.status === 'ON_DUTY' ? 'on-duty' : driver.status === 'AVAILABLE' ? 'available' : 'offline'}`}>
                        {driver.status === 'ON_DUTY' ? t('pages.drivers.statusOnDuty') : driver.status === 'AVAILABLE' ? t('pages.drivers.statusAvailable') : driver.status}
                      </span>
                    </td>
                    <td>
                      {driver.currentBusCode ? (
                        <span className="current-bus">
                          {driver.currentBusCode}
                          {busActive && <span className="bus-active-dot" title={t('pages.drivers.busInProgress')}>●</span>}
                        </span>
                      ) : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td className="actions">
                      {driver.currentBusId ? (
                        <button
                          onClick={() => handleUnassign(driver.id)}
                          className="btn btn-unassign btn-sm"
                          disabled={busActive}
                          title={busActive ? t('pages.drivers.unassignDisabledTitle') : t('pages.drivers.unassignTitle')}
                        >
                          {t('pages.drivers.unassignAction')}
                        </button>
                      ) : (
                        <button
                          onClick={() => setAssignModal({ open: true, driver })}
                          className="btn btn-primary btn-sm"
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

      {/* Modal de seleção de autocarro — substitui o dropdown bugado */}
      {assignModal.open && (
        <Modal
          open
          title={t('pages.drivers.assignModalTitle', { name: assignModal.driver?.name })}
          onClose={() => setAssignModal({ open: false, driver: null })}
        >
          <div className="assign-bus-list">
            {allBuses.length === 0 ? (
              <p className="assign-bus-empty">
                {t('pages.drivers.noBusesYet')} <Link to="/backoffice/buses" onClick={() => setAssignModal({ open: false, driver: null })}>{t('pages.drivers.busesLinkLabel')}</Link>.
              </p>
            ) : availableBuses.length === 0 ? (
              <p className="assign-bus-empty">
                {t('pages.drivers.allAssigned')}
              </p>
            ) : (
              availableBuses.map(bus => (
                <button
                  key={bus.id}
                  className="assign-bus-item"
                  onClick={() => handleAssign(assignModal.driver.id, bus.id)}
                >
                  <span className="assign-bus-code">{bus.busCode}</span>
                  <span className="assign-bus-info">
                    {bus.routeCode ? (
                      <>
                        <span className="assign-bus-route-code">{bus.routeCode}</span>
                        <span className="assign-bus-route-name">{bus.routeName}</span>
                      </>
                    ) : (
                      <span className="assign-bus-no-route">{t('pages.drivers.noRoute')}</span>
                    )}
                    <span className="assign-bus-status">{bus.status}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* Modal de erro */}
      {errorMsg && (
        <Modal open title={t('pages.drivers.errorTitle')} onClose={() => setErrorMsg(null)}>
          <p style={{ color: '#ef4444' }}>{errorMsg}</p>
        </Modal>
      )}
    </div>
  );
}
