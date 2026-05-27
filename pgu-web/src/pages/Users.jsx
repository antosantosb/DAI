import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import './Users.css';

const EMPTY_FORM = {
  username: '', email: '', firstName: '', lastName: '',
  password: '', role: 'operador', enabled: true,
  mechanographicNumber: '', phoneNumber: '',
};

export default function Users() {
  const { t } = useTranslation();
  // Apenas operador — contas admin são geridas diretamente no Keycloak
  const ROLE_OPTIONS = [
    { value: 'operador', label: t('pages.users.roleOperator') },
    { value: 'motorista', label: t('pages.users.roleDriver') },
  ];
  const { username: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState({ open: false });
  const [form, setForm] = useState(EMPTY_FORM);

  const showModal = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  const load = useCallback(() => {
    setLoading(true);
    api.get('/users')
      .then(r => setUsers(r.data || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close modal on Escape
  useEffect(() => {
    if (!showForm) return;
    const handler = (e) => { if (e.key === 'Escape') resetForm(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showForm]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowForm(false);
  };

  const generateMecNum = async () => {
    try {
      const { data } = await api.get('/drivers/next-mechanographic-number');
      setForm(prev => ({ ...prev, mechanographicNumber: data.mechanographicNumber }));
    } catch (err) {
      showModal({ type: 'danger', title: t('pages.users.errorTitle'), message: t('pages.users.errorMecNum') });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);

    const payload = {
      username: form.username.trim(),
      email: form.email.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      enabled: form.enabled,
      roles: [form.role],
    };
    if (form.password) payload.password = form.password;
    if (form.role === 'motorista') {
      payload.mechanographicNumber = form.mechanographicNumber.trim();
      payload.phoneNumber = form.phoneNumber.trim();
    }

    const req = editing
      ? api.put(`/users/${editing}`, payload)
      : api.post('/users', payload);

    req.then(() => {
      resetForm();
      load();
      showModal({
        type: 'success', title: t('pages.users.successTitle'),
        message: editing ? t('pages.users.userUpdated') : t('pages.users.accountCreated'),
      });
    }).catch(err => {
      showModal({
        type: 'danger', title: t('pages.users.errorTitle'),
        message: err.response?.data?.message || err.message || t('pages.users.errorProcessing'),
      });
    }).finally(() => setSubmitting(false));
  };

  const startEdit = (user) => {
    setForm({
      username: user.username || '',
      email: user.email || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      password: '',
      role: user.roles?.[0] || 'operador',
      enabled: user.enabled,
    });
    setEditing(user.id);
    setShowForm(true);
  };

  const handleToggle = (user) => {
    showModal({
      type: 'warning',
      title: user.enabled
        ? t('pages.users.toggleDeactivateTitle', { username: user.username })
        : t('pages.users.toggleActivateTitle', { username: user.username }),
      message: user.enabled
        ? t('pages.users.toggleDeactivateMessage')
        : t('pages.users.toggleActivateMessage'),
      confirmText: user.enabled ? t('pages.users.toggleDeactivate') : t('pages.users.toggleActivate'),
      onConfirm: () => {
        closeModal();
        api.patch(`/users/${user.id}/toggle`, { enabled: !user.enabled })
          .then(load)
          .catch(err => showModal({ type: 'danger', title: t('pages.users.errorTitle'), message: err.response?.data?.message || err.message }));
      },
    });
  };

  const handleDelete = (user) => {
    showModal({
      type: 'danger',
      title: t('pages.users.deleteUserTitle', { username: user.username }),
      message: t('pages.users.deleteUserMessage'),
      confirmText: t('pages.users.deleteUserConfirm'),
      onConfirm: () => {
        closeModal();
        api.delete(`/users/${user.id}`)
          .then(() => {
            load();
            showModal({ type: 'success', title: t('pages.users.successTitle'), message: t('pages.users.accountDeleted') });
          })
          .catch(err => showModal({ type: 'danger', title: t('pages.users.errorTitle'), message: err.response?.data?.message || err.message }));
      },
    });
  };

  const getRoleLabel = (roles) => {
    if (!roles?.length) return t('pages.users.roleNone');
    if (roles.includes('admin')) return t('pages.users.roleAdmin');
    if (roles.includes('operador')) return t('pages.users.roleOperator');
    if (roles.includes('motorista')) return t('pages.users.roleDriver');
    return roles[0];
  };

  const getRoleCls = (roles) => {
    if (roles?.includes('admin')) return 'user-role--admin';
    if (roles?.includes('operador')) return 'user-role--func';
    return 'user-role--none';
  };

  const filtered = users
    .filter(u => {
      if (filter === 'active') return u.enabled;
      if (filter === 'disabled') return !u.enabled;
      return true;
    })
    .filter(u => {
      if (!search) return true;
      const s = search.toLowerCase();
      return [u.username, u.email, u.firstName, u.lastName]
        .some(f => (f || '').toLowerCase().includes(s));
    })
    .sort((a, b) => {
      const aA = a.roles?.includes('admin') ? 0 : 1;
      const bA = b.roles?.includes('admin') ? 0 : 1;
      return aA !== bA ? aA - bA : (a.username || '').localeCompare(b.username || '');
    });

  const activeCount = users.filter(u => u.enabled).length;
  const disabledCount = users.filter(u => !u.enabled).length;

  return (
    <div>
      <Modal
        open={modal.open} onClose={closeModal} onConfirm={modal.onConfirm}
        title={modal.title} message={modal.message} type={modal.type}
        confirmText={modal.confirmText} cancelText={modal.cancelText}
      />

      <div className="page-header">
        <div>
          <h1>{t('pages.users.title')}</h1>
          <p className="page-subtitle">{t('pages.users.subtitleAlt')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          {t('pages.users.newAccount')}
        </button>
      </div>

      {/* Stats */}
      <div className="user-stats">
        <div className="user-stat-card user-stat-card--total">
          <div className="user-stat-icon user-stat-icon--total">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div className="user-stat-content">
            <div className="user-stat-value">{users.length}</div>
            <div className="user-stat-label">{t('pages.users.totalAccounts')}</div>
          </div>
        </div>
        <div className="user-stat-card user-stat-card--active">
          <div className="user-stat-icon user-stat-icon--active">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div className="user-stat-content">
            <div className="user-stat-value">{activeCount}</div>
            <div className="user-stat-label">{t('pages.users.activeAccounts')}</div>
          </div>
        </div>
        <div className="user-stat-card user-stat-card--disabled">
          <div className="user-stat-icon user-stat-icon--disabled">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <div className="user-stat-content">
            <div className="user-stat-value">{disabledCount}</div>
            <div className="user-stat-label">{t('pages.users.disabledAccounts')}</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="user-toolbar">
        <div className="search-bar">
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            placeholder={t('pages.users.searchPlaceholderFull')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label={t('pages.users.ariaSearchUsers')}
          />
        </div>
        <div className="user-filters" role="group" aria-label={t('pages.users.ariaFilterByState')}>
          {[
            { key: 'all', label: t('pages.users.filterAllLabel'), count: users.length },
            { key: 'active', label: t('pages.users.filterActiveLabel'), count: activeCount },
            { key: 'disabled', label: t('pages.users.filterDisabledLabel'), count: disabledCount },
          ].map(f => (
            <button
              key={f.key}
              className={`btn btn-filter${filter === f.key ? ' btn-filter--active' : ''}`}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
            >
              {`${f.label} (${f.count})`}
            </button>
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div
          className="user-modal-backdrop"
          onClick={resetForm}
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-modal-title"
        >
          <div className="user-modal" onClick={e => e.stopPropagation()}>
            <div className="user-modal-header">
              <h3 id="user-modal-title">
                {editing ? t('pages.users.modalEditUser') : t('pages.users.modalNewAccount')}
                <span className={`user-modal-badge ${editing ? 'user-modal-badge--edit' : 'user-modal-badge--new'}`}>
                  {editing ? t('pages.users.badgeEdit') : t('pages.users.badgeNew')}
                </span>
              </h3>
              <button
                className="user-modal-close"
                onClick={resetForm}
                type="button"
                aria-label={t('pages.users.closeModal')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="user-modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="user-username">{t('pages.users.labelUsername')}</label>
                    <input
                      id="user-username"
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      placeholder={t('pages.users.placeholderUsername')}
                      required
                      disabled={!!editing}
                      autoComplete="username"
                    />
                    {editing && (
                      <span className="form-hint">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                        {t('pages.users.hintUsernameKeycloak')}
                      </span>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="user-email">{t('pages.users.labelEmail')}</label>
                    <input
                      id="user-email"
                      type="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder={t('pages.users.placeholderEmail')}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="user-firstname">{t('pages.users.labelFirstName')}</label>
                    <input
                      id="user-firstname"
                      value={form.firstName}
                      onChange={e => setForm({ ...form, firstName: e.target.value })}
                      placeholder={t('pages.users.placeholderFirstName')}
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="user-lastname">{t('pages.users.labelLastName')}</label>
                    <input
                      id="user-lastname"
                      value={form.lastName}
                      onChange={e => setForm({ ...form, lastName: e.target.value })}
                      placeholder={t('pages.users.placeholderLastName')}
                      autoComplete="family-name"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="user-password">{editing ? t('pages.users.labelNewPassword') : t('pages.users.labelPassword')}</label>
                    <input
                      id="user-password"
                      type="password"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder={editing ? t('pages.users.placeholderPasswordEdit') : t('pages.users.placeholderPassword')}
                      required={!editing}
                      minLength={6}
                      autoComplete={editing ? 'new-password' : 'new-password'}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="user-role">{t('pages.users.labelRole')}</label>
                    {form.role === 'admin' ? (
                      <>
                        <input id="user-role" value={t('pages.users.roleAdminLong')} disabled />
                        <span className="form-hint">{t('pages.users.hintRoleAdmin')}</span>
                      </>
                    ) : (
                      <select
                        id="user-role"
                        value={form.role}
                        onChange={e => setForm({ ...form, role: e.target.value })}
                        disabled={editing}
                      >
                        {ROLE_OPTIONS.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    )}
                    {editing && <span className="form-hint">{t('pages.users.hintRoleEdit')}</span>}
                  </div>

                  {form.role === 'motorista' && !editing && (
                    <>
                      <div className="form-group">
                        <label htmlFor="user-mecnum">{t('pages.users.labelMecNum')}</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            id="user-mecnum"
                            type="text"
                            value={form.mechanographicNumber}
                            onChange={e => setForm({ ...form, mechanographicNumber: e.target.value })}
                            placeholder={t('pages.users.placeholderMecNum')}
                            required
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={generateMecNum}
                            title={t('pages.users.btnGenerateTitle')}
                          >
                            {t('pages.users.btnGenerate')}
                          </button>
                        </div>
                      </div>
                      <div className="form-group">
                        <label htmlFor="user-phone">{t('pages.users.labelPhone')}</label>
                        <input
                          id="user-phone"
                          type="tel"
                          value={form.phoneNumber}
                          onChange={e => setForm({ ...form, phoneNumber: e.target.value })}
                          placeholder={t('pages.users.placeholderPhone')}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="user-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  {t('pages.users.btnCancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className="user-loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                      {t('pages.users.btnProcessing')}
                    </>
                  ) : (
                    editing ? t('pages.users.btnSaveChanges') : t('pages.users.btnCreateAccount')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="user-loading">
          <div className="user-loading-spinner" />
          <span>{t('pages.users.loadingUsers')}</span>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table" role="table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>{t('pages.users.headers.user')}</th>
                <th style={{ width: '22%' }}>{t('pages.users.headers.email')}</th>
                <th style={{ width: '13%' }}>{t('pages.users.headers.role')}</th>
                <th style={{ width: '12%' }}>{t('pages.users.headers.state')}</th>
                <th style={{ width: '12%' }}>{t('pages.users.headers.created')}</th>
                <th style={{ width: '16%' }}>{t('pages.users.headers.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => {
                const isAdmin = user.roles?.includes('admin');
                return (
                  <tr key={user.id} className={!user.enabled ? 'user-row--disabled' : ''}>
                    <td>
                      <div className="user-cell">
                        <div className={`user-avatar ${getRoleCls(user.roles)}`} aria-hidden="true">
                          {(user.username || '?')[0].toUpperCase()}
                        </div>
                        <div className="user-cell-info">
                          <span className="user-cell-name">
                            {user.username}
                          </span>
                          {(user.firstName || user.lastName) && (
                            <span className="user-cell-full">
                              {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{user.email || '-'}</td>
                    <td>
                      <span className={`user-role-badge ${getRoleCls(user.roles)}`}>
                        {isAdmin ? (
                          <svg className="user-role-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                        ) : (
                          <svg className="user-role-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                          </svg>
                        )}
                        {getRoleLabel(user.roles)}
                      </span>
                    </td>
                    <td>
                      <span className={`user-status ${user.enabled ? 'user-status--active' : 'user-status--disabled'}`}>
                        <span className="user-status-dot" aria-hidden="true" />
                        {user.enabled ? t('pages.users.stateActive') : t('pages.users.stateInactive')}
                      </span>
                    </td>
                    <td className="user-date">
                      {user.createdTimestamp
                        ? new Date(user.createdTimestamp).toLocaleDateString('pt-PT')
                        : '-'}
                    </td>
                    <td>
                      <div className="user-actions">
                        <button
                          className="btn btn-sm"
                          onClick={() => startEdit(user)}
                          aria-label={t('pages.users.ariaEdit', { username: user.username })}
                        >
                          {t('pages.users.btnEdit')}
                        </button>
                        {!isAdmin && (
                          <>
                            <button
                              className={`btn btn-sm ${user.enabled ? 'btn-warning' : 'btn-success'}`}
                              onClick={() => handleToggle(user)}
                              aria-label={user.enabled ? t('pages.users.ariaDeactivate', { username: user.username }) : t('pages.users.ariaActivate', { username: user.username })}
                            >
                              {user.enabled ? t('pages.users.btnDeactivate') : t('pages.users.btnActivate')}
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDelete(user)}
                              aria-label={t('pages.users.ariaDelete', { username: user.username })}
                            >
                              {t('pages.users.btnDelete')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6">
                    <div className="user-empty">
                      <div className="user-empty-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                        </svg>
                      </div>
                      <div className="user-empty-title">
                        {search
                          ? t('pages.users.emptyNoResults')
                          : filter !== 'all'
                            ? (filter === 'active' ? t('pages.users.emptyNoActive') : t('pages.users.emptyNoDisabled'))
                            : t('pages.users.emptyNoAccounts')
                        }
                      </div>
                      <div className="user-empty-text">
                        {search
                          ? t('pages.users.emptyNoResultsHint', { q: search })
                          : filter !== 'all'
                            ? (filter === 'active' ? t('pages.users.emptyNoActiveHint') : t('pages.users.emptyNoDisabledHint'))
                            : t('pages.users.emptyCreateFirst')
                        }
                      </div>
                      {!search && filter === 'all' && (
                        <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true); }}>
                          {t('pages.users.createFirstButton')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
