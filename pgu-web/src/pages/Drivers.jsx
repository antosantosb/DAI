import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
import './Drivers.css';

export default function Drivers() {
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
      setErrorMsg(err.response?.data?.message || err.message || 'Atribuição falhou');
    }
  };

  const handleUnassign = async (driverId) => {
    try {
      await api.post('/drivers/unassign', { driverId });
      await fetchData();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Desatribuição falhou');
    }
  };

  if (loading) return <div className="empty-state">A carregar motoristas...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Motoristas</h1>
          <div className="page-subtitle">Gestão operacional — atribuir autocarros e ver estado</div>
        </div>
        <Link to="/backoffice/users" className="btn btn-primary">
          + Criar Motorista (em Utilizadores)
        </Link>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Nº Mecanográfico</th>
              <th>Telefone</th>
              <th>Estado</th>
              <th>Autocarro Atual</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty">
                  Sem motoristas registados. <Link to="/backoffice/users">Criar em Utilizadores →</Link>
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
                        {driver.status === 'ON_DUTY' ? 'Em serviço' : driver.status === 'AVAILABLE' ? 'Disponível' : driver.status}
                      </span>
                    </td>
                    <td>
                      {driver.currentBusCode ? (
                        <span className="current-bus">
                          {driver.currentBusCode}
                          {busActive && <span className="bus-active-dot" title="Em andamento">●</span>}
                        </span>
                      ) : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td className="actions">
                      {driver.currentBusId ? (
                        <button
                          onClick={() => handleUnassign(driver.id)}
                          className="btn btn-unassign btn-sm"
                          disabled={busActive}
                          title={busActive ? 'Não é possível desatribuir — autocarro em andamento' : 'Desatribuir do autocarro atual'}
                        >
                          Desatribuir
                        </button>
                      ) : (
                        <button
                          onClick={() => setAssignModal({ open: true, driver })}
                          className="btn btn-primary btn-sm"
                        >
                          Atribuir Autocarro
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
          title={`Atribuir autocarro a ${assignModal.driver?.name}`}
          onClose={() => setAssignModal({ open: false, driver: null })}
        >
          <div className="assign-bus-list">
            {allBuses.length === 0 ? (
              <p className="assign-bus-empty">
                Ainda não há autocarros registados. Cria em <Link to="/backoffice/buses" onClick={() => setAssignModal({ open: false, driver: null })}>Autocarros</Link>.
              </p>
            ) : availableBuses.length === 0 ? (
              <p className="assign-bus-empty">
                Todos os autocarros já têm motorista atribuído. Para reatribuir, primeiro remove o motorista actual.
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
                      <span className="assign-bus-no-route">Sem rota</span>
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
        <Modal open title="Erro" onClose={() => setErrorMsg(null)}>
          <p style={{ color: '#ef4444' }}>{errorMsg}</p>
        </Modal>
      )}
    </div>
  );
}
