import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../services/api';
import { createStompClient } from '../services/stompClient';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import './Exports.css';

/* ─── Icons (inline SVG) ─── */
const Icon = ({ d, size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>{typeof d === 'string' ? <path d={d}/> : d}</svg>
);
const TelemetryIcon = (p) => <Icon {...p} d={<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>}/>;
const LogIcon = (p) => <Icon {...p} d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>}/>;
const DownloadIcon = (p) => <Icon {...p} d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>}/>;
const TrashIcon = (p) => <Icon {...p} d={<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></>}/>;
const CheckCircleIcon = (p) => <Icon {...p} d={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}/>;
const ClockIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}/>;
const XCircleIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>}/>;
const EyeIcon = (p) => <Icon {...p} d={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}/>;
const InfoIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>}/>;
const SearchIcon = (p) => <Icon {...p} d={<><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></>}/>;
const ShieldIcon = (p) => <Icon {...p} d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>}/>;
const AlertIcon = (p) => <Icon {...p} d={<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}/>;
const UsersIcon = (p) => <Icon {...p} d={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>}/>;

export default function Exports() {
  const { t } = useTranslation();
  const { hasRole, username } = useAuth();
  const isAdmin = hasRole('admin');
  const [activeTab, setActiveTab] = useState('telemetry');

  // ─── Shared modal ───
  const [modal, setModal] = useState({ open: false });
  const showModal = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  return (
    <div>
      <Modal open={modal.open} onClose={closeModal} onConfirm={modal.onConfirm}
        title={modal.title} message={modal.message} type={modal.type}
        confirmText={modal.confirmText} cancelText={modal.cancelText} />

      <div className="page-header">
        <div>
          <h1>{t('pages.exports.title')}</h1>
          <p className="page-subtitle">{t('pages.exports.subtitleAlt')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="export-tabs" role="tablist" aria-label={t('pages.exports.ariaExportType')}>
        <button role="tab" aria-selected={activeTab === 'telemetry'}
          className={`export-tab ${activeTab === 'telemetry' ? 'export-tab--active' : ''}`}
          onClick={() => setActiveTab('telemetry')}>
          <TelemetryIcon size={16}/> {t('pages.exports.tabTelemetry')}
        </button>
        <button role="tab" aria-selected={activeTab === 'logs'}
          className={`export-tab ${activeTab === 'logs' ? 'export-tab--active' : ''}`}
          onClick={() => setActiveTab('logs')}>
          <LogIcon size={16}/> {t('pages.exports.tabLogs')}
        </button>
      </div>

      {activeTab === 'telemetry' && (
        <ExportPanel dataType="TELEMETRY" endpoint="/exports/telemetry" listParam="TELEMETRY"
          isAdmin={isAdmin} username={username} showModal={showModal} closeModal={closeModal}
          renderForm={(props) => <TelemetryForm {...props} />}
        />
      )}

      {activeTab === 'logs' && (
        <ExportPanel dataType="AUDIT_LOG" endpoint="/exports/logs" listParam="AUDIT_LOG"
          isAdmin={isAdmin} username={username} showModal={showModal} closeModal={closeModal}
          renderForm={(props) => <LogsForm {...props} />}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ExportPanel — componente reutilizado por ambas as tabs
   ═══════════════════════════════════════════════════════════════════ */
function ExportPanel({ dataType, endpoint, listParam, isAdmin, username, showModal, closeModal, renderForm, extraContent }) {
  const { t } = useTranslation();
  const [format, setFormat] = useState('CSV');
  const [fromTs, setFromTs] = useState('');
  const [toTs, setToTs] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  // F9: filtro Meus/Todos. Admin: default "all"; outros forçam "me" (ignorado pelo backend).
  const [ownerFilter, setOwnerFilter] = useState(isAdmin ? 'all' : 'me');

  // Load jobs for this type
  useEffect(() => {
    api.get(`/exports?type=${listParam}&owner=${ownerFilter}`)
      .then(r => setJobs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setJobs([]));
  }, [listParam, ownerFilter]);

  const upsertJob = useCallback((job) => {
    // Only upsert if this job belongs to our dataType
    if (job.dataType && job.dataType !== dataType) return;
    // F9: respeitar filtro de owner — não engadir job de outro user se o user
    // tem filtro "me". (Update de job existente passa sempre — significa que
    // foi gerado por nós mas filtro mudou; mantemos o estado atualizado.)
    setJobs(prev => {
      const ix = prev.findIndex(j => j.jobUuid === job.jobUuid);
      if (ix >= 0) return prev.map((j, i) => i === ix ? { ...j, ...job } : j);
      if (ownerFilter === 'me' && job.requestedBy && job.requestedBy !== username) return prev;
      return [job, ...prev];
    });
  }, [dataType, ownerFilter, username]);

  // STOMP — Sprint -1 (SEC-4) autenticado via JWT
  useEffect(() => {
    const client = createStompClient({
      onConnect: () => {
        client.subscribe('/topic/exports', (msg) => {
          if (!msg.body) return;
          try { upsertJob(JSON.parse(msg.body)); } catch (e) { console.error(e); }
        });
      },
    });
    client.activate();
    return () => client.deactivate();
  }, [upsertJob]);

  // Fallback polling
  useEffect(() => {
    const pending = jobs.filter(j => j.status === 'PENDING' || j.status === 'PROCESSING');
    if (pending.length === 0) return;
    const iv = setInterval(async () => {
      for (const j of pending) {
        try { const { data } = await api.get(`/exports/${j.jobUuid}`); upsertJob(data); } catch { /* noop */ }
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [jobs, upsertJob]);

  const handleSubmit = async (extraPayload = {}) => {
    setSubmitting(true);
    try {
      const payload = {
        format,
        from: fromTs ? new Date(fromTs).toISOString() : null,
        to: toTs ? new Date(toTs).toISOString() : null,
        requestedBy: username,
        ...extraPayload,
      };
      const { data } = await api.post(endpoint, payload);
      upsertJob(data);
      toast.info(t('pages.exports.submitted'));
    } catch (err) {
      console.error(err);
      toast.error(t('pages.exports.submitFailed'));
    } finally { setSubmitting(false); }
  };

  // Delete single
  const confirmDelete = (job) => {
    showModal({
      type: 'danger', title: t('pages.exports.deleteSingleTitle'),
      message: t('pages.exports.deleteSingleMessage', { format: job.format, uuid: job.jobUuid.slice(0, 8) }),
      confirmText: t('pages.exports.deleteConfirmBtn'),
      onConfirm: async () => {
        closeModal();
        try {
          await api.delete(`/exports/${job.jobUuid}`);
          setJobs(prev => prev.filter(j => j.jobUuid !== job.jobUuid));
          setSelected(prev => { const n = new Set(prev); n.delete(job.jobUuid); return n; });
          toast.success(t('pages.exports.deletedSuccess'));
        } catch (err) {
          const msg = err?.response?.status === 404
            ? t('pages.exports.alreadyGone')
            : (err?.response?.data?.message || err?.message || t('common.error'));
          toast.error(t('pages.exports.deleteFailed', { msg }));
        }
      },
    });
  };

  // Bulk delete (F9: CANCELED também é "terminal" e portanto deletable)
  const deletableJobs = jobs.filter(j => j.status === 'COMPLETED' || j.status === 'FAILED' || j.status === 'CANCELED');
  const selectedDeletable = [...selected].filter(id => deletableJobs.some(j => j.jobUuid === id));

  const confirmBulkDelete = () => {
    const count = selectedDeletable.length;
    if (count === 0) return;
    showModal({
      type: 'danger',
      title: t('pages.exports.deleteMultipleTitle', { count }),
      message: t('pages.exports.deleteMultipleMessage', { count }),
      confirmText: t('pages.exports.deleteBulkBtn', { count }),
      onConfirm: async () => {
        closeModal();
        let ok = 0, fail = 0;
        for (const id of selectedDeletable) {
          try { await api.delete(`/exports/${id}`); ok++; } catch { fail++; }
        }
        setJobs(prev => prev.filter(j => !selectedDeletable.includes(j.jobUuid)));
        setSelected(new Set());
        if (ok > 0) toast.success(ok > 1 ? t('pages.exports.bulkDeletedMany', { count: ok }) : t('pages.exports.bulkDeletedSingle', { count: ok }));
        if (fail > 0) toast.error(fail > 1 ? t('pages.exports.bulkFailedMany', { count: fail }) : t('pages.exports.bulkFailedSingle', { count: fail }));
      },
    });
  };

  // Selection helpers
  const toggleSelect = (id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    if (selectedDeletable.length === deletableJobs.length && deletableJobs.length > 0) setSelected(new Set());
    else setSelected(new Set(deletableJobs.map(j => j.jobUuid)));
  };
  const allSelected = deletableJobs.length > 0 && selectedDeletable.length === deletableJobs.length;
  const someSelected = selectedDeletable.length > 0 && !allSelected;

  // F9: Cancelar export em curso
  const confirmCancel = (job) => {
    showModal({
      type: 'warning',
      title: t('pages.exports.cancelConfirmTitle'),
      message: t('pages.exports.cancelConfirmMessage'),
      confirmText: t('pages.exports.cancel'),
      onConfirm: async () => {
        closeModal();
        try {
          const { data } = await api.post(`/exports/${job.jobUuid}/cancel`);
          // Atualização imediata; o WS confirmará com o estado final.
          upsertJob(data);
          toast.success(t('pages.exports.cancelSuccess'));
        } catch (err) {
          const msg = err?.response?.status === 409
            ? t('pages.exports.cancelFailed')
            : (err?.response?.data?.message || err?.message || t('pages.exports.cancelFailed'));
          toast.error(msg);
        }
      },
    });
  };

  // Stats
  const completedCount = jobs.filter(j => j.status === 'COMPLETED').length;
  const queuedCount = jobs.filter(j => j.status === 'PENDING').length;
  const runningCount = jobs.filter(j => j.status === 'PROCESSING').length;
  const failedCount = jobs.filter(j => j.status === 'FAILED').length;
  const canceledCount = jobs.filter(j => j.status === 'CANCELED').length;
  // "Em curso" original (PENDING+PROCESSING) é split em dois cards.
  const pendingCount = queuedCount + runningCount;

  return (
    <>
      {/* Stats Cards */}
      <div className="export-stats">
        <div className="export-stat-card export-stat-card--total">
          <div className="export-stat-icon export-stat-icon--total"><LogIcon size={20}/></div>
          <div className="export-stat-content">
            <div className="export-stat-value">{jobs.length}</div>
            <div className="export-stat-label">{t('pages.exports.statTotal')}</div>
          </div>
        </div>
        <div className="export-stat-card export-stat-card--completed">
          <div className="export-stat-icon export-stat-icon--completed"><CheckCircleIcon size={20}/></div>
          <div className="export-stat-content">
            <div className="export-stat-value">{completedCount}</div>
            <div className="export-stat-label">{t('pages.exports.statCompleted')}</div>
          </div>
        </div>
        <div className="export-stat-card export-stat-card--queued">
          <div className="export-stat-icon export-stat-icon--queued"><ClockIcon size={20}/></div>
          <div className="export-stat-content">
            <div className="export-stat-value">{queuedCount}</div>
            <div className="export-stat-label">{t('pages.exports.statQueued')}</div>
          </div>
        </div>
        <div className="export-stat-card export-stat-card--pending">
          <div className="export-stat-icon export-stat-icon--pending"><ClockIcon size={20}/></div>
          <div className="export-stat-content">
            <div className="export-stat-value">{runningCount}</div>
            <div className="export-stat-label">{t('pages.exports.statPending')}</div>
          </div>
        </div>
        <div className="export-stat-card export-stat-card--failed">
          <div className="export-stat-icon export-stat-icon--failed"><XCircleIcon size={20}/></div>
          <div className="export-stat-content">
            <div className="export-stat-value">{failedCount}</div>
            <div className="export-stat-label">{t('pages.exports.statFailed')}</div>
          </div>
        </div>
        <div className="export-stat-card export-stat-card--canceled">
          <div className="export-stat-icon export-stat-icon--canceled"><XCircleIcon size={20}/></div>
          <div className="export-stat-content">
            <div className="export-stat-value">{canceledCount}</div>
            <div className="export-stat-label">{t('pages.exports.statCanceled')}</div>
          </div>
        </div>
      </div>

      {/* Form — delegated to parent */}
      {renderForm({ format, setFormat, fromTs, setFromTs, toTs, setToTs, submitting, handleSubmit })}

      {/* Jobs Table */}
      <div className="export-history">
        <div className="export-history-header">
          <h2>{t('pages.exports.history')}</h2>
          <div className="export-history-actions">
            {/* F9: Filtro Meus/Todos — só faz sentido para admin (funcionario é
                automaticamente filtrado por backend). */}
            {isAdmin && (
              <div className="export-owner-filter" role="group" aria-label={t('pages.exports.filterOwnerAria')}>
                <button type="button"
                  className={`export-owner-btn ${ownerFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setOwnerFilter('all')}>
                  {t('pages.exports.filterAll')}
                </button>
                <button type="button"
                  className={`export-owner-btn ${ownerFilter === 'me' ? 'is-active' : ''}`}
                  onClick={() => setOwnerFilter('me')}>
                  {t('pages.exports.filterMine')}
                </button>
              </div>
            )}
            {selectedDeletable.length > 0 && isAdmin && (
              <button type="button" className="btn btn-danger btn-sm" onClick={confirmBulkDelete}>
                <TrashIcon size={14}/> {t('pages.exports.btnBulkDelete', { count: selectedDeletable.length })}
              </button>
            )}
            <span className="export-retention-note">
              <InfoIcon size={14}/> {t('pages.exports.retentionNote')}
            </span>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="export-empty">
            <div className="export-empty-icon"><LogIcon size={28}/></div>
            <div className="export-empty-title">{t('pages.exports.emptyTitle')}</div>
            <div className="export-empty-text">{t('pages.exports.emptyText')}</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table" role="table">
              <thead>
                <tr>
                  {isAdmin && (
                    <th className="export-checkbox-cell">
                      <label className="export-checkbox-label" aria-label={t('pages.exports.ariaSelectAll')}>
                        <input type="checkbox" checked={allSelected}
                          ref={el => { if (el) el.indeterminate = someSelected; }}
                          onChange={toggleSelectAll} disabled={deletableJobs.length === 0} />
                        <span className="export-checkbox-box" />
                      </label>
                    </th>
                  )}
                  <th>{t('pages.exports.tableFormat')}</th><th>{t('pages.exports.tableState')}</th><th>{t('pages.exports.tableRows')}</th><th>{t('pages.exports.thCreatedBy')}</th><th>{t('pages.exports.tableFile')}</th><th>{t('pages.exports.tableActions')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => {
                  const isDeletable = j.status === 'COMPLETED' || j.status === 'FAILED' || j.status === 'CANCELED';
                  const isSelected = selected.has(j.jobUuid);
                  return (
                    <tr key={j.jobUuid} className={isSelected ? 'export-row--selected' : ''}>
                      {isAdmin && (
                        <td className="export-checkbox-cell">
                          {isDeletable ? (
                            <label className="export-checkbox-label">
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(j.jobUuid)} />
                              <span className="export-checkbox-box" />
                            </label>
                          ) : <span className="export-checkbox-placeholder" />}
                        </td>
                      )}
                      <td><span className={`export-format-badge export-format--${j.format?.toLowerCase()}`}>{j.format}</span></td>
                      <td>
                        <span className={`export-status export-status--${j.status?.toLowerCase()}`}>
                          <span className="export-status-dot" />
                          {j.status === 'COMPLETED' ? t('pages.exports.statusCompleted')
                           : j.status === 'PENDING' ? t('pages.exports.statusPending')
                           : j.status === 'PROCESSING' ? t('pages.exports.statusProcessing')
                           : j.status === 'FAILED' ? t('pages.exports.statusFailed')
                           : j.status === 'CANCELED' ? t('pages.exports.statusCanceled')
                           : j.status}
                        </span>
                      </td>
                      <td className="export-number">{j.rowCount ?? '-'}</td>
                      <td className="export-created-by" title={j.requestedBy || ''}>
                        {j.requestedBy || '—'}
                      </td>
                      <td className="export-filename" title={j.fileName || ''}>
                        {j.fileName ? j.fileName.length > 40 ? j.fileName.slice(0, 40) + '…' : j.fileName : '-'}
                      </td>
                      <td>
                        <div className="export-actions">
                          {j.status === 'COMPLETED' && j.downloadUrl && (
                            <>
                              {(j.format || '').toUpperCase() === 'PDF' && (
                                <button type="button" className="btn btn-sm" onClick={async () => {
                                  try {
                                    // F9 (MinIO): pedimos uma presigned URL fresca e abrimos
                                    // diretamente. O browser obtem os bytes do MinIO sem passar
                                    // pelo backend.
                                    const res = await api.get(j.downloadUrl.replace(/^.*\/api\/v1/, ''));
                                    const presigned = res.data?.url;
                                    if (!presigned) throw new Error('no url');
                                    window.open(presigned, '_blank', 'noopener,noreferrer');
                                  } catch { toast.error(t('pages.exports.openPdfFailed')); }
                                }}><EyeIcon size={14}/> {t('pages.exports.viewPdf')}</button>
                              )}
                              <button type="button" className="btn btn-sm btn-primary" onClick={async () => {
                                try {
                                  // F9 (MinIO): obter presigned URL on-demand e disparar download
                                  // via anchor com download attr (preserva fileName).
                                  const res = await api.get(j.downloadUrl.replace(/^.*\/api\/v1/, ''));
                                  const presigned = res.data?.url;
                                  if (!presigned) throw new Error('no url');
                                  const ext = (j.format || 'csv').toLowerCase();
                                  const a = document.createElement('a');
                                  a.href = presigned;
                                  a.download = j.fileName || `relatorio.${ext}`;
                                  a.rel = 'noopener noreferrer';
                                  document.body.appendChild(a); a.click(); a.remove();
                                } catch { toast.error(t('pages.exports.downloadFailed')); }
                              }}><DownloadIcon size={14}/> {t('pages.exports.download')}</button>
                            </>
                          )}
                          {j.status === 'FAILED' && (
                            <span className="export-error-hint" title={j.errorMessage}>
                              <InfoIcon size={14}/> {t('pages.exports.viewError')}
                            </span>
                          )}
                          {(j.status === 'PENDING' || j.status === 'PROCESSING') && (
                            <>
                              <span className="export-processing-hint"><span className="export-spinner" />{t('pages.exports.processing')}</span>
                              {(isAdmin || j.requestedBy === username) && (
                                <button type="button" className="btn btn-sm btn-ghost-danger" onClick={() => confirmCancel(j)} title={t('pages.exports.cancel')}>
                                  <XCircleIcon size={14}/> {t('pages.exports.cancel')}
                                </button>
                              )}
                            </>
                          )}
                          {isAdmin && isDeletable && (
                            <button type="button" className="export-delete-btn" onClick={() => confirmDelete(j)} title={t('pages.exports.btnDelete')}>
                              <TrashIcon size={14}/>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Extra content (e.g. Log Viewer) */}
      {extraContent}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TelemetryForm — formulário específico de telemetria (com bus picker)
   ═══════════════════════════════════════════════════════════════════ */
function TelemetryForm({ format, setFormat, fromTs, setFromTs, toTs, setToTs, submitting, handleSubmit }) {
  const { t } = useTranslation();
  const [busId, setBusId] = useState('');
  const [busOptions, setBusOptions] = useState([]);
  const [busPickerOpen, setBusPickerOpen] = useState(false);
  const [busHighlight, setBusHighlight] = useState(-1);
  const busFieldRef = useRef(null);

  useEffect(() => {
    api.get('/buses')
      .then(r => setBusOptions((r.data || []).map(b => ({
        busCode: b.busCode, routeCode: b.routeCode, routeName: b.routeName,
      }))))
      .catch(() => setBusOptions([]));
  }, []);

  useEffect(() => {
    if (!busPickerOpen) return;
    const onDocClick = (e) => {
      if (busFieldRef.current && !busFieldRef.current.contains(e.target)) setBusPickerOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [busPickerOpen]);

  const filteredBuses = (() => {
    const q = busId.trim().toLowerCase();
    if (!q) return busOptions;
    return busOptions.filter(b =>
      b.busCode.toLowerCase().includes(q) ||
      (b.routeCode || '').toLowerCase().includes(q) ||
      (b.routeName || '').toLowerCase().includes(q)
    );
  })();

  const pickBus = (bus) => { setBusId(bus.busCode); setBusPickerOpen(false); setBusHighlight(-1); };

  const onBusKeyDown = (e) => {
    if (!busPickerOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { setBusPickerOpen(true); return; }
    if (!busPickerOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setBusHighlight(i => Math.min(i + 1, filteredBuses.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setBusHighlight(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && busHighlight >= 0) { e.preventDefault(); pickBus(filteredBuses[busHighlight]); }
    else if (e.key === 'Escape') setBusPickerOpen(false);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    handleSubmit({ busId: busId.trim() || null });
  };

  return (
    <form className="export-form" onSubmit={onSubmit}>
      <div className="export-form-fields">
        <div className="export-field">
          <label htmlFor="export-format">{t('pages.exports.formFormat')}</label>
          <select id="export-format" value={format} onChange={e => setFormat(e.target.value)}>
            <option value="CSV">CSV</option>
            <option value="PDF">PDF</option>
          </select>
        </div>
        <div className="export-field" ref={busFieldRef}>
          <label htmlFor="export-bus-input">{t('pages.exports.formBus')}</label>
          <div className={`export-combobox ${busPickerOpen ? 'is-open' : ''}`}>
            <input id="export-bus-input" type="text" role="combobox"
              aria-expanded={busPickerOpen} aria-controls="export-bus-listbox" aria-autocomplete="list"
              placeholder={t('pages.exports.formBusAll')} value={busId}
              onChange={e => { setBusId(e.target.value); setBusPickerOpen(true); setBusHighlight(-1); }}
              onFocus={() => setBusPickerOpen(true)} onKeyDown={onBusKeyDown} autoComplete="off" />
            {busId && (
              <button type="button" className="export-combobox-clear" onClick={() => { setBusId(''); setBusPickerOpen(false); }} aria-label={t('pages.exports.ariaClearSelection')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
            <button type="button" className="export-combobox-toggle" onClick={() => setBusPickerOpen(o => !o)} aria-label={busPickerOpen ? t('pages.exports.ariaCloseList') : t('pages.exports.ariaOpenList')} tabIndex={-1}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {busPickerOpen && busOptions.length > 0 && (
              <ul className="export-combobox-list" id="export-bus-listbox" role="listbox">
                {filteredBuses.length === 0 && <li className="export-combobox-empty">{t('pages.exports.noMatches')}</li>}
                {filteredBuses.map((b, i) => (
                  <li key={b.busCode} role="option" aria-selected={busHighlight === i}
                    className={`export-combobox-item ${busHighlight === i ? 'is-active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); pickBus(b); }}
                    onMouseEnter={() => setBusHighlight(i)}>
                    <span className="export-combobox-code">{b.busCode}</span>
                    {b.routeCode && <span className="export-combobox-meta">{b.routeCode}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="export-field">
          <label htmlFor="export-from">{t('pages.exports.formFrom')}</label>
          <input id="export-from" type="datetime-local" value={fromTs} onChange={e => setFromTs(e.target.value)} />
        </div>
        <div className="export-field">
          <label htmlFor="export-to">{t('pages.exports.formTo')}</label>
          <input id="export-to" type="datetime-local" value={toTs} onChange={e => setToTs(e.target.value)} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary export-submit-btn" disabled={submitting}>
        {submitting ? (<><span className="export-spinner" />{t('pages.exports.btnGenerating')}</>) : (<><DownloadIcon size={16}/> {t('pages.exports.btnGenerateReport')}</>)}
      </button>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   LogsForm — formulário específico de logs (formato + datas)
   ═══════════════════════════════════════════════════════════════════ */
function LogsForm({ format, setFormat, fromTs, setFromTs, toTs, setToTs, submitting, handleSubmit }) {
  const { t } = useTranslation();
  const onSubmit = (e) => {
    e.preventDefault();
    handleSubmit();
  };

  return (
    <form className="export-form" onSubmit={onSubmit}>
      <div className="export-form-fields export-form-fields--logs">
        <div className="export-field">
          <label htmlFor="log-export-format">{t('pages.exports.formFormat')}</label>
          <select id="log-export-format" value={format} onChange={e => setFormat(e.target.value)}>
            <option value="CSV">CSV</option>
            <option value="PDF">PDF</option>
          </select>
        </div>
        <div className="export-field">
          <label htmlFor="log-export-from">{t('pages.exports.formFrom')}</label>
          <input id="log-export-from" type="datetime-local" value={fromTs} onChange={e => setFromTs(e.target.value)} />
        </div>
        <div className="export-field">
          <label htmlFor="log-export-to">{t('pages.exports.formTo')}</label>
          <input id="log-export-to" type="datetime-local" value={toTs} onChange={e => setToTs(e.target.value)} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary export-submit-btn" disabled={submitting}>
        {submitting ? (<><span className="export-spinner" />{t('pages.exports.btnGenerating')}</>) : (<><DownloadIcon size={16}/> {t('pages.exports.btnGenerateLogsReport')}</>)}
      </button>
    </form>
  );
}

