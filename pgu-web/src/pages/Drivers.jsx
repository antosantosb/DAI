import { useEffect, useState } from 'react';
import api from '../services/api';
import './Drivers.css';  // ← added

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [activeBuses, setActiveBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: '', mechanographicNumber: '', phoneNumber: '' });

  const fetchData = async () => {
    try {
      const [driversRes, busesRes] = await Promise.all([
        api.get('/drivers'),
        api.get('/buses?status=ACTIVE')
      ]);
      setDrivers(driversRes.data);
      setActiveBuses(busesRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const assignDriver = async (driverId, busId) => {
    if (!busId) return;
    try {
      await api.post('/drivers/assign', { driverId, busId });
      await fetchData();
    } catch (err) {
      alert('Assignment failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const unassignDriver = async (driverId) => {
    try {
      await api.post('/drivers/unassign', { driverId });
      await fetchData();
    } catch (err) {
      alert('Unassign failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const createDriver = async (e) => {
    e.preventDefault();
    try {
      await api.post('/drivers', newDriver);
      setShowForm(false);
      setNewDriver({ name: '', mechanographicNumber: '', phoneNumber: '' });
      await fetchData();
    } catch (err) {
      alert('Error creating driver: ' + (err.response?.data?.message || err.message));
    }
  };

  if (loading) return <div className="empty-state">Loading drivers...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Drivers</h1>
          <div className="page-subtitle">Manage bus drivers and assignments</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          + New Driver
        </button>
      </div>

      {showForm && (
        <div className="form-overlay">
          <div className="form-card">
            <h3>Register New Driver</h3>
            <form onSubmit={createDriver}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={newDriver.name}
                    onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Mechanographic Number</label>
                  <input
                    type="text"
                    value={newDriver.mechanographicNumber}
                    onChange={(e) => setNewDriver({ ...newDriver, mechanographicNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    value={newDriver.phoneNumber}
                    onChange={(e) => setNewDriver({ ...newDriver, phoneNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">Save</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Mechanographic #</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Current Bus</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty">No drivers found.</td>
              </tr>
            ) : (
              drivers.map(driver => (
                <tr key={driver.id}>
                  <td>{driver.name}</td>
                  <td>{driver.mechanographicNumber}</td>
                  <td>{driver.phoneNumber || '—'}</td>
                  <td>
                    <span className={`driver-status driver-status--${driver.status === 'ON_DUTY' ? 'on-duty' : driver.status === 'AVAILABLE' ? 'available' : 'offline'}`}>
                      {driver.status}
                    </span>
                  </td>
                  <td>
                    {driver.currentBusId ? (
                      <span className="current-bus">Bus {driver.currentBusId}</span>
                    ) : '—'}
                  </td>
                  <td className="actions">
                    <select
                      onChange={(e) => assignDriver(driver.id, e.target.value)}
                      defaultValue=""
                      className="assign-select"
                    >
                      <option value="" disabled>Assign to bus</option>
                      {activeBuses.map(bus => (
                        <option key={bus.id} value={bus.id}>
                          {bus.busCode || bus.id}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => unassignDriver(driver.id)}
                      className="btn btn-unassign btn-sm"
                    >
                      Unassign
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}