// Sprint 2 (Vertical 3.4, R.ICP.07): inventario de sensores de contagem de
// passageiros (APC). CRUD restrito a admin/funcionario.
//
// Backend: GET/POST/DELETE /api/v1/sensors (PassengerSensorDTO).
// Campos do DTO: id, gateway, busId, doorPosition, status, lastReading,
// latitude, longitude, createdAt, updatedAt. Reutiliza os estilos da pagina
// de Operadores (Operators.css) para nao introduzir CSS novo.
import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import './Operators.css';

// Estado do sensor -> cor da "bolinha". Tolerante a maiusculas/minusculas.
const STATUS_COLORS = {
  active:      'var(--color-success)',
  ok:          'var(--color-success)',
  online:      'var(--color-success)',
  inactive:    'var(--color-text-secondary)',
  offline:     'var(--color-text-secondary)',
  maintenance: 'var(--color-warning)',
  fault:       'var(--color-danger)',
  error:       'var(--color-danger)',
};

function statusColor(status) {
  if (!status) return 'var(--color-text-secondary)';
  return STATUS_COLORS[String(status).toLowerCase()] || 'var(--color-text-secondary)';
}

// Posicoes de porta tipicas dos sistemas APC.
const DOOR_OPTIONS = ['FRONT', 'MIDDLE', 'REAR'];
const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'FAULT'];

export default function Sensors() {
  const { t, i18n } = useTranslation();
  const { hasRole } = useAuth();
  // Mutacoes permitidas a admin/funcionario; developer ve a pagina (rota) e
  // tambem o botao de criar, alinhado com as outras paginas de gestao.
  const canEdit = hasRole('admin') || hasRole('funcionario') || hasRole('developer');

  const [sensors, setSensors] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [modal, setModal] = useState({ open: false });

  function emptyForm() {
    return { gateway: '', busId: '', doorPosition: 'FRONT', status: 'ACTIVE', latitude: '', longitude: '' };
  }

  const showModalMsg = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  const load = () => {
    api.get('/sensors')
      // 204 No Content -> r.data === '' (axios). Normaliza para [].
      .then(r => setSensors(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSensors([]));
  };

  useEffect(load, []);

  // Formata um Instant ISO para data/hora local legivel; "—" se ausente.
  const fmtReading = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(i18n.language === 'en' ? 'en-GB' : 'pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sensors;
    return sensors.filter(s =>
      (s.gateway || '').toLowerCase().includes(q) ||
      String(s.busId ?? '').toLowerCase().includes(q) ||
      (s.doorPosition || '').toLowerCase().includes(q) ||
      (s.status || '').toLowerCase().includes(q)
    );
  }, [sensors, search]);

  const resetForm = () => {
    setForm(emptyForm());
    setShowForm(false);
  };

  const startCreate = () => {
    setForm(emptyForm());
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      gateway: form.gateway.trim(),
      busId: form.busId === '' ? null : Number(form.busId),
      doorPosition: form.doorPosition || null,
      status: form.status || null,
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude),
    };
    api.post('/sensors', payload)
      .then(() => {
        resetForm();
        load();
        showModalMsg({
          type: 'success',
          title: t('pages.sensors.successTitle'),
          message: t('pages.sensors.successCreated'),
        });
      })
      .catch(err => showModalMsg({
        type: 'danger',
        title: t('pages.sensors.errorTitle'),
        message: err.response?.data?.message || err.message,
      }));
  };

  const handleDelete = (s) => {
    showModalMsg({
      type: 'danger',
      title: t('pages.sensors.deleteTitle'),
      message: t('pages.sensors.deleteMessage', { gateway: s.gateway }),
      confirmText: t('pages.sensors.deleteConfirm'),
      onConfirm: () => {
        closeModal();
        // Optimistic: remove ja' da lista; em sucesso toast, em erro repoe a
        // lista e avisa via toast (rollback).
        const prev = sensors;
        setSensors(prev.filter(x => x.id !== s.id));
        api.delete(`/sensors/${s.id}`)
          .then(() => toast.success(t('pages.sensors.deletedToast', { gateway: s.gateway })))
          .catch(err => {
            setSensors(prev);
            toast.error(err.response?.data?.message || t('pages.sensors.deleteErrorToast'));
          });
      },
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('pages.sensors.title')}</h1>
          <p className="page-subtitle">{t('pages.sensors.subtitle')}</p>
        </div>
        {canEdit && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={startCreate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '6px', verticalAlign: '-3px' }}>
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('pages.sensors.newSensor')}
            </button>
          </div>
        )}
      </div>

      <div className="operators-toolbar">
        <div className="search-bar">
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            placeholder={t('pages.sensors.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {showForm && canEdit && (
        <div className="form-overlay">
          <form className="form-card" onSubmit={handleSubmit}>
            <h3>{t('pages.sensors.create')}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('pages.sensors.fieldGateway')} *</label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  value={form.gateway}
                  onChange={e => setForm({ ...form, gateway: e.target.value })}
                  placeholder="GW-APC-001"
                />
              </div>
              <div className="form-group">
                <label>{t('pages.sensors.fieldBusId')}</label>
                <input
                  type="number"
                  min="1"
                  value={form.busId}
                  onChange={e => setForm({ ...form, busId: e.target.value })}
                  placeholder="12"
                />
              </div>
              <div className="form-group">
                <label>{t('pages.sensors.fieldDoorPosition')}</label>
                <select
                  value={form.doorPosition}
                  onChange={e => setForm({ ...form, doorPosition: e.target.value })}
                >
                  {DOOR_OPTIONS.map(d => (
                    <option key={d} value={d}>{t(`pages.sensors.door.${d}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('pages.sensors.fieldStatus')}</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{t(`pages.sensors.statusLabel.${s}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('pages.sensors.fieldLatitude')}</label>
                <input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={e => setForm({ ...form, latitude: e.target.value })}
                  placeholder="41.5454"
                />
              </div>
              <div className="form-group">
                <label>{t('pages.sensors.fieldLongitude')}</label>
                <input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={e => setForm({ ...form, longitude: e.target.value })}
                  placeholder="-8.4265"
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {t('common.create')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('pages.sensors.headers.gateway')}</th>
              <th>{t('pages.sensors.headers.bus')}</th>
              <th>{t('pages.sensors.headers.door')}</th>
              <th>{t('pages.sensors.headers.status')}</th>
              <th>{t('pages.sensors.headers.lastReading')}</th>
              {canEdit && <th>{t('pages.sensors.headers.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="empty">{t('pages.sensors.noSensors')}</td>
              </tr>
            ) : (
              filtered.map(s => (
                <tr key={s.id}>
                  <td><span className="operator-code">{s.gateway}</span></td>
                  <td>{s.busId != null ? s.busId : '—'}</td>
                  <td>{s.doorPosition ? t(`pages.sensors.door.${s.doorPosition}`, s.doorPosition) : '—'}</td>
                  <td>
                    <span className="sensor-status">
                      <span
                        className="sensor-status-dot"
                        style={{ background: statusColor(s.status) }}
                        aria-hidden="true"
                      />
                      {s.status ? t(`pages.sensors.statusLabel.${s.status}`, s.status) : '—'}
                    </span>
                  </td>
                  <td>{fmtReading(s.lastReading)}</td>
                  {canEdit && (
                    <td className="actions">
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(s)}
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText={modal.confirmText}
        onConfirm={modal.onConfirm}
        onClose={closeModal}
      />
    </div>
  );
}
