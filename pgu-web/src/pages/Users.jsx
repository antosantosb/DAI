import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import PasswordInput from '../components/PasswordInput';
import './Users.css';

const EMPTY_FORM = {
  username: '', email: '', firstName: '', lastName: '',
  password: '', role: 'funcionario', enabled: true,
  mechanographicNumber: '', phoneNumber: '',
};

export default function Users() {
  const { t } = useTranslation();
  // Apenas funcionario — contas admin são geridas diretamente no Keycloak
  const ROLE_OPTIONS = [
    { value: 'funcionario', label: t('pages.users.roleFuncionario') },
    { value: 'motorista', label: t('pages.users.roleDriver') },
  ];
  const { username: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  // Sprint 1 follow-up: helper que sabe se o user em edição é a conta dev —
  // usado em vários sítios do modal para disable campos não-password.
  // (calculado em cada render porque depende de `users` que muda).
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [modal, setModal] = useState({ open: false });
  const [form, setForm] = useState(EMPTY_FORM);
  // Sprint 1 follow-up: enriquecer linhas de motoristas com bus + duty status.
  // Indexed por keycloakUserId para join O(1) na tabela.
  const [driverByKcId, setDriverByKcId] = useState({});
  // Sprint 1 follow-up: bulk select estilo Exports — checkbox sempre visivel,
  // toolbar so aparece quando ha >=1 seleccionado.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const showModal = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  // Sprint 1 follow-up: editingDev = true sse estamos a editar a conta dev.
  // Locka os campos não-password do modal e força o reset password como
  // único motivo de Edit aceite. Backend faz sanitize defensivo na mesma.
  const editingDevUser = editing ? users.find((u) => u.id === editing) : null;
  const editingDev = !!editingDevUser?.roles?.includes('developer');

  // ─── Sprint 1 follow-up: bulk actions estilo Exports ──────────────────
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const runBulk = async (ids, fn, successKey, errorKey) => {
    setBulkLoading(true);
    const results = await Promise.allSettled(ids.map(fn));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const ko = results.length - ok;
    await new Promise((r) => { load(); r(); });
    clearSelection();
    setBulkLoading(false);
    if (ko === 0) {
      showModal({ type: 'success', title: t('toasts.successGeneric'),
        message: t(successKey, { count: ok }) });
    } else {
      showModal({ type: 'warning', title: t('toasts.errorGeneric'),
        message: t(errorKey, { ok, ko }) });
    }
  };

  // Sprint 1 follow-up: 2 helpers separados
  //   - eligibleForToggle: exclui só admin (dev pode ser desativado)
  //   - eligibleForDelete: exclui admin + dev (dev nao pode ser eliminado)
  const eligibleForToggle = () => {
    return Array.from(selectedIds).filter((id) => {
      const u = users.find((x) => x.id === id);
      return u && !u.roles?.includes('admin');
    });
  };
  const eligibleForDelete = () => {
    return Array.from(selectedIds).filter((id) => {
      const u = users.find((x) => x.id === id);
      return u && !u.roles?.includes('admin') && !u.roles?.includes('developer');
    });
  };

  const handleBulkEnable = () => {
    const ids = eligibleForToggle().filter((id) => {
      const u = users.find((x) => x.id === id);
      return u && !u.enabled;
    });
    if (ids.length === 0) {
      showModal({ type: 'info', title: t('pages.users.bulkNoEligibleTitle'),
        message: t('pages.users.bulkEnableNoEligible') });
      return;
    }
    runBulk(ids, (id) => api.patch(`/users/${id}/toggle`, { enabled: true }),
      'pages.users.bulkEnableSuccess', 'pages.users.bulkPartial');
  };

  const handleBulkDisable = () => {
    const ids = eligibleForToggle().filter((id) => {
      const u = users.find((x) => x.id === id);
      return u && u.enabled;
    });
    if (ids.length === 0) {
      showModal({ type: 'info', title: t('pages.users.bulkNoEligibleTitle'),
        message: t('pages.users.bulkDisableNoEligible') });
      return;
    }
    runBulk(ids, (id) => api.patch(`/users/${id}/toggle`, { enabled: false }),
      'pages.users.bulkDisableSuccess', 'pages.users.bulkPartial');
  };

  const handleBulkDelete = () => {
    const ids = eligibleForDelete();
    if (ids.length === 0) {
      showModal({ type: 'info', title: t('pages.users.bulkNoEligibleTitle'),
        message: t('pages.users.bulkDeleteNoEligible') });
      return;
    }
    showModal({
      type: 'danger',
      title: t('pages.users.bulkDeleteTitle', { count: ids.length }),
      message: t('pages.users.bulkDeleteMessage', { count: ids.length }),
      confirmText: t('pages.users.bulkDeleteConfirm'),
      onConfirm: () => {
        closeModal();
        runBulk(ids, (id) => api.delete(`/users/${id}`),
          'pages.users.bulkDeleteSuccess', 'pages.users.bulkPartial');
      },
    });
  };

  const load = useCallback(() => {
    setLoading(true);
    // Fetch users + drivers em paralelo. Drivers tem keycloakUserId + bus
    // assignment + status (ON_DUTY/AVAILABLE/OFFLINE), usado para enriquecer
    // a linha quando o user e' motorista.
    Promise.all([
      api.get('/users').then(r => r.data || []).catch(() => []),
      api.get('/drivers').then(r => r.data || []).catch(() => []),
    ]).then(([usersData, driversData]) => {
      setUsers(usersData);
      const map = {};
      for (const d of driversData) {
        if (d.keycloakUserId) map[d.keycloakUserId] = d;
      }
      setDriverByKcId(map);
    }).finally(() => setLoading(false));
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
    if (form.role === 'motorista' && !editing) {
      payload.mechanographicNumber = (form.mechanographicNumber || '').trim();
      payload.phoneNumber = (form.phoneNumber || '').trim();
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
      role: user.roles?.[0] || 'funcionario',
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
    if (roles.includes('developer')) return t('auth.roles.developer');
    if (roles.includes('funcionario')) return t('pages.users.roleFuncionario');
    if (roles.includes('motorista')) return t('pages.users.roleDriver');
    return roles[0];
  };

  const getRoleCls = (roles) => {
    if (roles?.includes('admin')) return 'user-role--admin';
    if (roles?.includes('developer')) return 'user-role--dev';
    if (roles?.includes('funcionario')) return 'user-role--func';
    return 'user-role--none';
  };

  // Sprint 1 follow-up: role principal de um user (prioridade: admin > developer > funcionario > motorista).
  const primaryRole = (roles) => {
    if (!roles?.length) return 'none';
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('developer')) return 'developer';
    if (roles.includes('funcionario')) return 'funcionario';
    if (roles.includes('motorista')) return 'motorista';
    return 'none';
  };

  const filtered = users
    .filter(u => {
      if (filter === 'active') return u.enabled;
      if (filter === 'disabled') return !u.enabled;
      return true;
    })
    .filter(u => roleFilter === 'all' ? true : primaryRole(u.roles) === roleFilter)
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

  // Sprint 1 follow-up: contadores cruzam os 2 filtros. Cada pilula mostra
  // "quantos resultados terias se carregasses nesta" — o "All" do estado
  // respeita o role filter, e vice-versa.
  const usersByRole = roleFilter === 'all'
    ? users
    : users.filter(u => primaryRole(u.roles) === roleFilter);
  const usersByState = users.filter(u => {
    if (filter === 'active') return u.enabled;
    if (filter === 'disabled') return !u.enabled;
    return true;
  });
  const activeCount = usersByRole.filter(u => u.enabled).length;
  const disabledCount = usersByRole.filter(u => !u.enabled).length;
  const stateAllCount = usersByRole.length;
  const countByRole = (key) => key === 'all'
    ? usersByState.length
    : usersByState.filter(u => primaryRole(u.roles) === key).length;

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
        <button
          className="btn btn-primary"
          onClick={() => { resetForm(); setShowForm(true); }}
        >
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
        <div className="user-filter-group" role="group" aria-label={t('pages.users.ariaFilterByState')}>
          <span className="user-filter-label">{t('pages.users.filterStateLabel')}</span>
          {[
            { key: 'all', label: t('pages.users.filterAllLabel'), count: stateAllCount },
            { key: 'active', label: t('pages.users.filterActiveLabel'), count: activeCount },
            { key: 'disabled', label: t('pages.users.filterDisabledLabel'), count: disabledCount },
          ].map(f => (
            <button
              key={f.key}
              className={`btn btn-filter btn-filter--sm${filter === f.key ? ' btn-filter--active' : ''}`}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
            >
              {`${f.label} (${f.count})`}
            </button>
          ))}
        </div>

        <div className="user-filter-group" role="group" aria-label={t('pages.users.ariaFilterByRole')}>
          <span className="user-filter-label">{t('pages.users.filterRoleLabel')}</span>
          {[
            { key: 'all',          label: t('pages.users.roleFilterAll') },
            { key: 'admin',        label: t('pages.users.roleAdmin') },
            { key: 'funcionario',  label: t('pages.users.roleFuncionario') },
            { key: 'motorista',    label: t('pages.users.roleDriver') },
          ].map(r => {
            const c = countByRole(r.key);
            return (
              <button
                key={r.key}
                className={`btn btn-filter btn-filter--sm${roleFilter === r.key ? ' btn-filter--active' : ''}`}
                onClick={() => setRoleFilter(r.key)}
                aria-pressed={roleFilter === r.key}
              >
                {`${r.label} (${c})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sprint 1 follow-up: bulk action bar — visivel so quando ha selecao */}
      {selectedIds.size > 0 && (
        <div className="bulk-bar bulk-bar--visible" style={{ marginTop: '16px' }}>
          <div className="bulk-bar-left">
            <span className="bulk-bar-count">
              {t('pages.users.bulkSelected', { count: selectedIds.size })}
            </span>
            <button type="button" className="bulk-bar-link" onClick={clearSelection} disabled={bulkLoading}>
              {t('pages.users.bulkClear')}
            </button>
          </div>
          <div className="bulk-bar-actions">
            <button className="btn btn-sm btn-success" onClick={handleBulkEnable} disabled={bulkLoading}>
              {t('pages.users.bulkEnable')}
            </button>
            <button className="btn btn-sm btn-warning" onClick={handleBulkDisable} disabled={bulkLoading}>
              {t('pages.users.bulkDisable')}
            </button>
            <button className="btn btn-sm btn-danger" onClick={handleBulkDelete} disabled={bulkLoading}>
              {t('pages.users.bulkDelete')}
            </button>
          </div>
        </div>
      )}

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
                {(() => {
                  // Sprint 1 follow-up: a editar conta dev — banner + lock dos
                  // campos não-password. Backend faz sanitize defensivo.
                  const editingUser = editing ? users.find(u => u.id === editing) : null;
                  const editingDev = !!editingUser?.roles?.includes('developer');
                  if (!editingDev) return null;
                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 12px',
                        marginBottom: 16,
                        background: 'var(--color-warning-light)',
                        color: 'var(--color-warning-hover)',
                        border: '1px solid var(--color-warning-light)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 13,
                        lineHeight: 1.45,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      <span>{t('pages.users.devEditHint')}</span>
                    </div>
                  );
                })()}
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="user-username">{t('pages.users.labelUsername')}</label>
                    <input
                      id="user-username"
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      placeholder={t('pages.users.placeholderUsername')}
                      required
                      disabled={editingDev}
                      autoComplete="username"
                    />
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
                      disabled={editingDev}
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
                      disabled={editingDev}
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
                      disabled={editingDev}
                      autoComplete="family-name"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="user-password">{editing ? t('pages.users.labelNewPassword') : t('pages.users.labelPassword')}</label>
                    <PasswordInput
                      id="user-password"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder={editing ? t('pages.users.placeholderPasswordEdit') : t('pages.users.placeholderPassword')}
                      required={!editing || editingDev}
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="user-role">{t('pages.users.labelRole')}</label>
                    {form.role === 'admin' ? (
                      <>
                        <input id="user-role" value={t('pages.users.roleAdminLong')} disabled />
                        <span className="form-hint">{t('pages.users.hintRoleAdmin')}</span>
                      </>
                    ) : form.role === 'developer' ? (
                      <input id="user-role" value={t('auth.roles.developer')} disabled />
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
                {/* Sprint 1 follow-up: column de checkbox (estilo Exports). */}
                <th className="user-checkbox-cell">
                  <label className="user-checkbox-label" aria-label={t('pages.users.ariaSelectAll')}>
                    <input
                      type="checkbox"
                      ref={(el) => {
                        if (!el) return;
                        const selectable = filtered.filter((u) => !u.roles?.includes('admin'));
                        const selectedSelectable = selectable.filter((u) => selectedIds.has(u.id));
                        el.checked = selectable.length > 0 && selectedSelectable.length === selectable.length;
                        el.indeterminate = selectedSelectable.length > 0 && selectedSelectable.length < selectable.length;
                      }}
                      onChange={(e) => {
                        const selectable = filtered.filter((u) => !u.roles?.includes('admin'));
                        if (e.target.checked) {
                          setSelectedIds(new Set(selectable.map((u) => u.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                    />
                    <span className="user-checkbox-box" />
                  </label>
                </th>
                <th style={{ width: '20%' }}>{t('pages.users.headers.user')}</th>
                <th style={{ width: '16%' }}>{t('pages.users.headers.email')}</th>
                <th style={{ width: '10%' }}>{t('pages.users.headers.role')}</th>
                <th style={{ width: '13%' }}>{t('pages.users.headers.assignment')}</th>
                <th style={{ width: '10%' }}>{t('pages.users.headers.state')}</th>
                <th style={{ width: '10%' }}>{t('pages.users.headers.created')}</th>
                <th style={{ width: '15%' }}>{t('pages.users.headers.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => {
                const isAdmin = user.roles?.includes('admin');
                const isDev = user.roles?.includes('developer');
                // Sprint 1 follow-up: politica de proteção:
                //   - admin    -> nao pode ser desativado nem eliminado
                //   - dev      -> pode ser desativado, NAO pode ser eliminado
                //   - outros   -> tudo permitido
                const cannotDelete = isAdmin || isDev;
                const cannotToggle = isAdmin;
                // Sprint 1 follow-up: admin nao tem botao Edit; dev pode ser
                // "editado" apenas para reset password (modal restringe campos).
                const cannotEdit = isAdmin;
                const isMotorista = user.roles?.includes('motorista');
                const driver = isMotorista ? driverByKcId[user.id] : null;
                const isSelected = selectedIds.has(user.id);
                const rowCls = [
                  !user.enabled ? 'user-row--disabled' : '',
                  isSelected ? 'user-row--selected' : '',
                ].filter(Boolean).join(' ');
                return (
                  <tr key={user.id} className={rowCls}>
                    {/* Sprint 1 follow-up: checkbox (admins nao seleccionaveis). */}
                    <td className="user-checkbox-cell">
                      {!isAdmin ? (
                        <label className="user-checkbox-label" aria-label={t('pages.users.ariaSelectRow', { username: user.username })}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(user.id)}
                          />
                          <span className="user-checkbox-box" />
                        </label>
                      ) : (
                        <span className="user-checkbox-placeholder" />
                      )}
                    </td>
                    <td>
                      <div className="user-cell">
                        <Avatar
                          url={user.avatarUrl}
                          name={[user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username}
                          size="md"
                        />
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
                      {isMotorista && driver ? (
                        <div className="user-assignment">
                          <span className="user-assignment-mec">{driver.mechanographicNumber || '-'}</span>
                          {driver.status === 'ON_DUTY' ? (
                            <span className="user-duty user-duty--on">{t('pages.users.dutyOn')}</span>
                          ) : driver.status === 'OFFLINE' ? (
                            <span className="user-duty user-duty--off">{t('pages.users.dutyOffline')}</span>
                          ) : (
                            <span className="user-duty user-duty--avail">{t('pages.users.dutyAvailable')}</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-light)' }}>-</span>
                      )}
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
                    <td className="actions">
                      <div className="user-actions">
                        {isAdmin ? (
                          // Admin: nenhuma accao individual permitida
                          <span
                            title={t('pages.users.protectedAccount')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-light)', fontSize: 12 }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            {t('pages.users.protectedAccount')}
                          </span>
                        ) : (
                          <>
                            {/* Edit: escondido para dev (campos sao read-only) */}
                            {!cannotEdit && (
                              <button
                                className="btn btn-sm"
                                onClick={() => startEdit(user)}
                                aria-label={t('pages.users.ariaEdit', { username: user.username })}
                              >
                                {t('pages.users.btnEdit')}
                              </button>
                            )}
                            {/* Disable/Enable: visivel sempre que !isAdmin (inclui dev) */}
                            <button
                              className={`btn btn-sm ${user.enabled ? 'btn-warning' : 'btn-success'}`}
                              onClick={() => handleToggle(user)}
                              aria-label={user.enabled ? t('pages.users.ariaDeactivate', { username: user.username }) : t('pages.users.ariaActivate', { username: user.username })}
                            >
                              {user.enabled ? t('pages.users.btnDeactivate') : t('pages.users.btnActivate')}
                            </button>
                            {/* Delete: escondido para dev (conta singular protegida) */}
                            {!cannotDelete && (
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => handleDelete(user)}
                                aria-label={t('pages.users.ariaDelete', { username: user.username })}
                              >
                                {t('pages.users.btnDelete')}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="8">
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
