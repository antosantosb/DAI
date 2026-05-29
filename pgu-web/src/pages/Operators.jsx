// Sprint 1 (F0): pagina de gestao de Operadores de transporte (R.IVT.03).
// CRUD restrito a admin/developer. Read aberto a todos os autenticados.
import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import './Operators.css';

export default function Operators() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('developer');

  const [operators, setOperators] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [modal, setModal] = useState({ open: false });

  function emptyForm() {
    return { code: '', name: '', taxId: '', country: 'PT', contactEmail: '' };
  }

  const showModalMsg = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  const load = () => {
    api.get('/operators')
      .then(r => setOperators(r.data || []))
      .catch(() => setOperators([]));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return operators;
    return operators.filter(o =>
      (o.code || '').toLowerCase().includes(q) ||
      (o.name || '').toLowerCase().includes(q) ||
      (o.taxId || '').toLowerCase().includes(q)
    );
  }, [operators, search]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditing(null);
    setShowForm(false);
  };

  const startCreate = () => {
    setForm(emptyForm());
    setEditing(null);
    setShowForm(true);
  };

  const startEdit = (op) => {
    setForm({
      code: op.code || '',
      name: op.name || '',
      taxId: op.taxId || '',
      country: op.country || 'PT',
      contactEmail: op.contactEmail || '',
    });
    setEditing(op.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      taxId: form.taxId.trim() || null,
      country: (form.country || 'PT').trim().toUpperCase(),
      contactEmail: form.contactEmail.trim() || null,
    };
    const req = editing
      ? api.patch(`/operators/${editing}`, payload)
      : api.post('/operators', payload);

    req.then(() => {
      resetForm();
      load();
      showModalMsg({
        type: 'success',
        title: t('pages.operators.successTitle'),
        message: editing ? t('pages.operators.successUpdated') : t('pages.operators.successCreated'),
      });
    }).catch(err => {
      showModalMsg({
        type: 'danger',
        title: t('pages.operators.errorTitle'),
        message: err.response?.data?.message || err.message,
      });
    });
  };

  const handleDelete = (op) => {
    showModalMsg({
      type: 'danger',
      title: t('pages.operators.deleteTitle'),
      message: t('pages.operators.deleteMessage', { name: op.name }),
      confirmText: t('pages.operators.deleteConfirm'),
      onConfirm: () => {
        closeModal();
        api.delete(`/operators/${op.id}`)
          .then(load)
          .catch(err => showModalMsg({
            type: 'danger',
            title: t('pages.operators.errorTitle'),
            message: err.response?.data?.message || err.message,
          }));
      },
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('pages.operators.title')}</h1>
          <p className="page-subtitle">{t('pages.operators.subtitle')}</p>
        </div>
        {canEdit && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={startCreate}>
              {t('pages.operators.newOperator')}
            </button>
          </div>
        )}
      </div>

      <div className="operators-toolbar">
        <div className="search-bar">
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            placeholder={t('pages.operators.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {showForm && canEdit && (
        <div className="form-overlay">
          <form className="form-card" onSubmit={handleSubmit}>
            <h3>{editing ? t('pages.operators.edit') : t('pages.operators.create')}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('pages.operators.fieldCode')} *</label>
                <input
                  type="text"
                  required
                  maxLength={32}
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                  placeholder="TUB"
                  disabled={editing != null && form.code === 'TUB'}
                />
              </div>
              <div className="form-group">
                <label>{t('pages.operators.fieldName')} *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Transportes Urbanos de Braga"
                />
              </div>
              <div className="form-group">
                <label>{t('pages.operators.fieldTaxId')}</label>
                <input
                  type="text"
                  maxLength={32}
                  value={form.taxId}
                  onChange={e => setForm({ ...form, taxId: e.target.value })}
                  placeholder="500091466"
                />
              </div>
              <div className="form-group">
                <label>{t('pages.operators.fieldCountry')}</label>
                <input
                  type="text"
                  maxLength={2}
                  value={form.country}
                  onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })}
                  placeholder="PT"
                />
              </div>
              <div className="form-group">
                <label>{t('pages.operators.fieldContactEmail')}</label>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={e => setForm({ ...form, contactEmail: e.target.value })}
                  placeholder="geral@operador.pt"
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editing ? t('common.save') : t('common.create')}
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
              <th>{t('pages.operators.headers.code')}</th>
              <th>{t('pages.operators.headers.name')}</th>
              <th>{t('pages.operators.headers.taxId')}</th>
              <th>{t('pages.operators.headers.country')}</th>
              <th>{t('pages.operators.headers.contactEmail')}</th>
              <th style={{ width: '110px' }}>{t('pages.operators.headers.routes')}</th>
              <th>{t('pages.operators.headers.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty">{t('pages.operators.noOperators')}</td>
              </tr>
            ) : (
              filtered.map(op => (
                <tr key={op.id}>
                  <td><span className="operator-code">{op.code}</span></td>
                  <td>{op.name}</td>
                  <td>{op.taxId || '—'}</td>
                  <td>{op.country || '—'}</td>
                  <td>{op.contactEmail || '—'}</td>
                  <td>
                    <Link
                      to={`/backoffice/routes?operator=${encodeURIComponent(op.code)}`}
                      className="count-badge count-badge--link"
                      title={t('pages.operators.viewRoutes')}
                    >
                      {op.routeCount ?? 0}
                    </Link>
                  </td>
                  <td className="actions">
                    {canEdit && (
                      <>
                        <button className="btn btn-sm" onClick={() => startEdit(op)}>
                          {t('common.edit')}
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(op)}
                          disabled={op.code === 'TUB'}
                          title={op.code === 'TUB' ? t('pages.operators.protectedOperator') : undefined}
                        >
                          {t('common.delete')}
                        </button>
                      </>
                    )}
                  </td>
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
