import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import './GtfsManager.css';

/* ─── Icons (inline SVG) ─── */
const Icon = ({ d, size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {typeof d === 'string' ? <path d={d}/> : d}
  </svg>
);
const UploadIcon = (p) => <Icon {...p} d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>}/>;
const DownloadIcon = (p) => <Icon {...p} d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>}/>;
const RefreshIcon = (p) => <Icon {...p} d={<><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>}/>;
const ClockIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}/>;
const CheckIcon = (p) => <Icon {...p} d={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}/>;
const XIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>}/>;
const UndoIcon = (p) => <Icon {...p} d={<><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></>}/>;
const AlertIcon = (p) => <Icon {...p} d={<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}/>;
const FileIcon = (p) => <Icon {...p} d={<><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></>}/>;
const PlayIcon = (p) => <Icon {...p} d={<><polygon points="5 3 19 12 5 21 5 3"/></>}/>;
const PauseIcon = (p) => <Icon {...p} d={<><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>}/>;
const GlobeIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>}/>;
const InfoIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>}/>;

export default function GtfsManager() {
  const { t } = useTranslation();
  const SOURCE_LABELS = {
    UPLOAD: t('pages.gtfs.sourceUpload'),
    TUB_MANUAL: t('pages.gtfs.sourceTubManual'),
    TUB_SCHEDULED: t('pages.gtfs.sourceTubScheduled'),
  };
  const STATUS_MAP = {
    PROCESSING: { label: t('pages.gtfs.stProcessing'), cls: 'gtfs-badge--processing', icon: ClockIcon },
    COMPLETED: { label: t('pages.gtfs.stCompleted'), cls: 'gtfs-badge--completed', icon: CheckIcon },
    FAILED: { label: t('pages.gtfs.stFailed'), cls: 'gtfs-badge--failed', icon: XIcon },
    REVERTED: { label: t('pages.gtfs.stReverted'), cls: 'gtfs-badge--reverted', icon: UndoIcon },
  };
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [activeTab, setActiveTab] = useState('upload');
  const [imports, setImports] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [modal, setModal] = useState({ open: false });
  const fileRef = useRef(null);
  const dropRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // ─── Fetch data ───
  const fetchImports = useCallback(async () => {
    try {
      const { data } = await api.get('/gtfs/imports');
      setImports(data);
    } catch { /* silent */ }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await api.get('/gtfs/config');
      setConfig(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    Promise.all([fetchImports(), fetchConfig()]).finally(() => setLoading(false));
    const interval = setInterval(fetchImports, 10000);
    return () => clearInterval(interval);
  }, [fetchImports, fetchConfig]);

  // ─── File handling ───
  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error(t('pages.gtfs.onlyZip'));
      return;
    }
    setSelectedFile(file);
    setPreview(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/gtfs/preview', formData);
      setPreview(data);
    } catch (err) {
      toast.error(t('pages.gtfs.previewError') + (err.response?.data?.error || err.message));
      setSelectedFile(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      await api.post('/gtfs/upload', formData);
      toast.success(t('pages.gtfs.importStarted'));
      setSelectedFile(null);
      setPreview(null);
      setActiveTab('history');
      setTimeout(fetchImports, 2000);
    } catch (err) {
      toast.error(t('pages.gtfs.uploadError') + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  const handleSyncTub = async () => {
    setSyncing(true);
    try {
      await api.post('/gtfs/sync-tub');
      toast.success(t('pages.gtfs.tubSyncStarted'));
      setActiveTab('history');
      setTimeout(fetchImports, 2000);
    } catch (err) {
      toast.error(t('pages.gtfs.errorPrefix') + (err.response?.data?.error || err.message));
    } finally {
      setSyncing(false);
    }
  };

  const handleRevert = async (imp) => {
    setModal({
      open: true,
      title: t('pages.gtfs.revertTitle'),
      message: t('pages.gtfs.revertModalMessage', { id: imp.id, stops: imp.stopsCreated, routes: imp.routesCreated }),
      type: 'danger',
      confirmText: t('pages.gtfs.revert'),
      cancelText: t('pages.gtfs.cancel'),
      onConfirm: async () => {
        setModal({ open: false });
        try {
          await api.post(`/gtfs/imports/${imp.id}/revert`);
          toast.success(t('pages.gtfs.revertedSuccess'));
          fetchImports();
        } catch (err) {
          toast.error(err.response?.data?.error || t('pages.gtfs.revertError'));
        }
      },
    });
  };

  // ─── Schedule config ───
  const handleConfigUpdate = async (updates, { silent = false } = {}) => {
    if (savingConfig) return;
    setSavingConfig(true);
    try {
      const { data } = await api.put('/gtfs/config', { ...config, ...updates });
      setConfig(data);
      if (!silent) toast.success(t('pages.gtfs.configUpdated'));
      if (updates.scheduleActive) fetchImports();          // refresh lista se ativou
    } catch (err) {
      toast.error(t('pages.gtfs.errorPrefix') + (err.response?.data?.error || err.message));
    } finally {
      setSavingConfig(false);
    }
  };

  // ─── Drag & drop ───
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const closeModal = () => setModal({ open: false });
  const formatDate = (iso) => iso ? new Date(iso).toLocaleString('pt-PT') : '—';

  if (loading) return <div className="gtfs-loading">{t('pages.gtfs.loading')}</div>;

  // Stats
  const totalImports = imports.length;
  const completedImports = imports.filter(i => i.status === 'COMPLETED').length;
  const failedImports = imports.filter(i => i.status === 'FAILED').length;
  const processingImports = imports.filter(i => i.status === 'PROCESSING').length;

  return (
    <div>
      <Modal open={modal.open} onClose={closeModal} onConfirm={modal.onConfirm}
        title={modal.title} message={modal.message} type={modal.type}
        confirmText={modal.confirmText} cancelText={modal.cancelText} />

      <div className="page-header">
        <div>
          <h1>{t('pages.gtfs.pageTitle')}</h1>
          <p className="page-subtitle">{t('pages.gtfs.pageSubtitle')}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="gtfs-stats">
        <div className="gtfs-stat-card gtfs-stat-card--total">
          <div className="gtfs-stat-icon gtfs-stat-icon--total"><FileIcon size={20}/></div>
          <div className="gtfs-stat-content">
            <span className="gtfs-stat-value">{totalImports}</span>
            <span className="gtfs-stat-label">{t('pages.gtfs.statTotal')}</span>
          </div>
        </div>
        <div className="gtfs-stat-card gtfs-stat-card--completed">
          <div className="gtfs-stat-icon gtfs-stat-icon--completed"><CheckIcon size={20}/></div>
          <div className="gtfs-stat-content">
            <span className="gtfs-stat-value">{completedImports}</span>
            <span className="gtfs-stat-label">{t('pages.gtfs.statCompleted')}</span>
          </div>
        </div>
        <div className="gtfs-stat-card gtfs-stat-card--processing">
          <div className="gtfs-stat-icon gtfs-stat-icon--processing"><ClockIcon size={20}/></div>
          <div className="gtfs-stat-content">
            <span className="gtfs-stat-value">{processingImports}</span>
            <span className="gtfs-stat-label">{t('pages.gtfs.statProcessing')}</span>
          </div>
        </div>
        <div className="gtfs-stat-card gtfs-stat-card--failed">
          <div className="gtfs-stat-icon gtfs-stat-icon--failed"><XIcon size={20}/></div>
          <div className="gtfs-stat-content">
            <span className="gtfs-stat-value">{failedImports}</span>
            <span className="gtfs-stat-label">{t('pages.gtfs.statFailed')}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="gtfs-tabs" role="tablist">
        <button role="tab" aria-selected={activeTab === 'upload'}
          className={`gtfs-tab ${activeTab === 'upload' ? 'gtfs-tab--active' : ''}`}
          onClick={() => setActiveTab('upload')}>
          <UploadIcon size={16}/> {t('pages.gtfs.tabUpload')}
        </button>
        <button role="tab" aria-selected={activeTab === 'history'}
          className={`gtfs-tab ${activeTab === 'history' ? 'gtfs-tab--active' : ''}`}
          onClick={() => setActiveTab('history')}>
          <ClockIcon size={16}/> {t('pages.gtfs.tabHistory')}
        </button>
        <button role="tab" aria-selected={activeTab === 'schedule'}
          className={`gtfs-tab ${activeTab === 'schedule' ? 'gtfs-tab--active' : ''}`}
          onClick={() => setActiveTab('schedule')}>
          <RefreshIcon size={16}/> {t('pages.gtfs.tabSchedule')}
        </button>
      </div>

      {/* ─── Tab: Upload ─── */}
      {activeTab === 'upload' && (
        <div className="gtfs-panel">
          <div className="gtfs-upload-grid">
            {/* Drag & Drop zone */}
            <div className="gtfs-upload-zone-wrapper">
              <h3 className="gtfs-section-title"><UploadIcon size={18}/> {t('pages.gtfs.uploadSectionTitle')}</h3>
              <div
                ref={dropRef}
                className={`gtfs-dropzone ${dragOver ? 'gtfs-dropzone--active' : ''} ${selectedFile ? 'gtfs-dropzone--has-file' : ''}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".zip" hidden
                  onChange={(e) => handleFile(e.target.files?.[0])} />
                {!selectedFile ? (
                  <>
                    <UploadIcon size={40} className="gtfs-dropzone-icon"/>
                    <p className="gtfs-dropzone-text">{t('pages.gtfs.dropHere')}</p>
                    <p className="gtfs-dropzone-hint">{t('pages.gtfs.clickToSelect')}</p>
                  </>
                ) : (
                  <>
                    <FileIcon size={32}/>
                    <p className="gtfs-dropzone-text">{selectedFile.name}</p>
                    <p className="gtfs-dropzone-hint">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                  </>
                )}
              </div>

              {/* Preview */}
              {preview && (
                <div className="gtfs-preview">
                  <h4 className="gtfs-preview-title"><InfoIcon size={16}/> {t('pages.gtfs.previewLabel')}</h4>
                  <div className="gtfs-preview-grid">
                    {preview.stopsCount !== undefined && (
                      <div className="gtfs-preview-item">
                        <span className="gtfs-preview-value">{preview.stopsCount}</span>
                        <span className="gtfs-preview-label">{t('pages.gtfs.previewStops')}</span>
                      </div>
                    )}
                    {preview.routesCount !== undefined && (
                      <div className="gtfs-preview-item">
                        <span className="gtfs-preview-value">{preview.routesCount}</span>
                        <span className="gtfs-preview-label">{t('pages.gtfs.previewRoutes')}</span>
                      </div>
                    )}
                    {preview.shapesCount !== undefined && (
                      <div className="gtfs-preview-item">
                        <span className="gtfs-preview-value">{preview.shapesCount}</span>
                        <span className="gtfs-preview-label">{t('pages.gtfs.previewShapes')}</span>
                      </div>
                    )}
                    {preview.tripsCount !== undefined && (
                      <div className="gtfs-preview-item">
                        <span className="gtfs-preview-value">{preview.tripsCount}</span>
                        <span className="gtfs-preview-label">{t('pages.gtfs.previewTrips')}</span>
                      </div>
                    )}
                  </div>

                  {preview.warnings?.length > 0 && (
                    <div className="gtfs-warnings">
                      {preview.warnings.map((w, i) => (
                        <div key={i} className="gtfs-warning">
                          <AlertIcon size={14}/> {w}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="gtfs-preview-actions">
                    <button className="gtfs-btn gtfs-btn--secondary" onClick={() => {
                      setSelectedFile(null); setPreview(null);
                    }}>
                      {t('pages.gtfs.cancel')}
                    </button>
                    <button className="gtfs-btn gtfs-btn--primary" onClick={handleUpload}
                      disabled={uploading || !preview.valid}>
                      {uploading ? t('pages.gtfs.importing') : t('pages.gtfs.importLabel')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sync TUB */}
            <div className="gtfs-tub-zone">
              <h3 className="gtfs-section-title"><GlobeIcon size={18}/> {t('pages.gtfs.syncTubTitle')}</h3>
              <div className="gtfs-tub-card">
                <p className="gtfs-tub-description">
                  {t('pages.gtfs.syncTubDescription')}
                </p>
                <div className="gtfs-tub-url">
                  <span className="gtfs-tub-url-label">{t('pages.gtfs.sourceLabel')}</span>
                  <code className="gtfs-tub-url-value">{config?.gtfsUrl || 'tub.pt/developer/gtfs/feed/tub.zip'}</code>
                </div>
                <button className="gtfs-btn gtfs-btn--accent" onClick={handleSyncTub}
                  disabled={syncing}>
                  <DownloadIcon size={16}/>
                  {syncing ? t('pages.gtfs.syncing') : t('pages.gtfs.syncNow')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tab: History ─── */}
      {activeTab === 'history' && (
        <div className="gtfs-panel">
          {imports.length === 0 ? (
            <div className="gtfs-empty">
              <FileIcon size={48}/>
              <p>{t('pages.gtfs.noImports')}</p>
            </div>
          ) : (
            <div className="gtfs-table-wrapper">
              <table className="gtfs-table">
                <thead>
                  <tr>
                    <th>{t('pages.gtfs.thId')}</th>
                    <th>{t('pages.gtfs.thDate')}</th>
                    <th>{t('pages.gtfs.thSource')}</th>
                    <th>{t('pages.gtfs.thState')}</th>
                    <th>{t('pages.gtfs.thStops')}</th>
                    <th>{t('pages.gtfs.thRoutes')}</th>
                    <th>{t('pages.gtfs.thSchedules')}</th>
                    <th>{t('pages.gtfs.thBy')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map(imp => {
                    const st = STATUS_MAP[imp.status] || STATUS_MAP.PROCESSING;
                    const StIcon = st.icon;
                    return (
                      <tr key={imp.id} className={imp.status === 'REVERTED' ? 'gtfs-row--reverted' : ''}>
                        <td className="gtfs-cell-id">#{imp.id}</td>
                        <td className="gtfs-cell-date">{formatDate(imp.createdAt)}</td>
                        <td>
                          <span className="gtfs-source-badge">{SOURCE_LABELS[imp.source] || imp.source}</span>
                        </td>
                        <td>
                          <span className={`gtfs-badge ${st.cls}`}>
                            <StIcon size={12}/> {st.label}
                          </span>
                        </td>
                        <td className="gtfs-cell-num">
                          {imp.stopsCreated > 0 && <span className="gtfs-num-created">+{imp.stopsCreated}</span>}
                          {imp.stopsUpdated > 0 && <span className="gtfs-num-updated">{t('pages.gtfs.stopsUpd', { count: imp.stopsUpdated })}</span>}
                          {imp.stopsCreated === 0 && imp.stopsUpdated === 0 && '—'}
                        </td>
                        <td className="gtfs-cell-num">
                          {imp.routesCreated > 0 && <span className="gtfs-num-created">+{imp.routesCreated}</span>}
                          {imp.routesUpdated > 0 && <span className="gtfs-num-updated">{t('pages.gtfs.stopsUpd', { count: imp.routesUpdated })}</span>}
                          {imp.routesCreated === 0 && imp.routesUpdated === 0 && '—'}
                        </td>
                        <td className="gtfs-cell-num">
                          {imp.schedulesLoaded > 0
                            ? <span className="gtfs-num-created">{imp.schedulesLoaded.toLocaleString()}</span>
                            : '—'}
                        </td>
                        <td className="gtfs-cell-user">{imp.createdBy || '—'}</td>
                        <td className="gtfs-cell-actions">
                          {imp.canRevert && (
                            <button className="gtfs-btn-icon gtfs-btn-icon--danger"
                              title={t('pages.gtfs.revertTooltip')} onClick={() => handleRevert(imp)}>
                              <UndoIcon size={15}/>
                            </button>
                          )}
                          {imp.status === 'FAILED' && imp.errorMessage && (
                            <button className="gtfs-btn-icon" title={imp.errorMessage}>
                              <AlertIcon size={15}/>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Schedule ─── */}
      {activeTab === 'schedule' && config && (
        <div className="gtfs-panel">
          <div className="gtfs-schedule-card">
            <div className="gtfs-schedule-header">
              <div className="gtfs-schedule-status">
                {config.scheduleActive ? (
                  <><div className="gtfs-schedule-dot gtfs-schedule-dot--active"/> {t('pages.gtfs.scheduleActive')}</>
                ) : (
                  <><div className="gtfs-schedule-dot gtfs-schedule-dot--inactive"/> {t('pages.gtfs.scheduleInactive')}</>
                )}
              </div>
              <button
                className={`gtfs-btn ${config.scheduleActive ? 'gtfs-btn--danger' : 'gtfs-btn--primary'}`}
                onClick={() => handleConfigUpdate({ scheduleActive: !config.scheduleActive })}
                disabled={savingConfig}
              >
                {savingConfig
                  ? <><RefreshIcon size={16} className="gtfs-spin"/> {t('pages.gtfs.saving')}</>
                  : config.scheduleActive
                    ? <><PauseIcon size={16}/> {t('pages.gtfs.deactivate')}</>
                    : <><PlayIcon size={16}/> {t('pages.gtfs.activate')}</>}
              </button>
            </div>

            <div className="gtfs-schedule-body">
              <div className="gtfs-schedule-field">
                <label className="gtfs-label">{t('pages.gtfs.syncInterval')}</label>
                <div className="gtfs-interval-options">
                  {[6, 12, 24, 48, 168].map(h => (
                    <button key={h}
                      className={`gtfs-interval-btn ${config.intervalHours === h ? 'gtfs-interval-btn--active' : ''}`}
                      onClick={() => handleConfigUpdate({ intervalHours: h }, { silent: true })}
                    >
                      {h < 24 ? `${h}h` : h === 24 ? t('pages.gtfs.intervalOneDay') : h === 48 ? t('pages.gtfs.intervalTwoDays') : t('pages.gtfs.intervalOneWeek')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="gtfs-schedule-field">
                <label className="gtfs-label">{t('pages.gtfs.feedUrl')}</label>
                <div className="gtfs-url-input-group">
                  <input type="text" className="gtfs-input" value={config.gtfsUrl || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, gtfsUrl: e.target.value }))}
                    placeholder="https://www.tub.pt/developer/gtfs/feed/tub.zip"
                  />
                  <button className="gtfs-btn gtfs-btn--secondary"
                    onClick={() => handleConfigUpdate({ gtfsUrl: config.gtfsUrl })}>
                    {t('pages.gtfs.save')}
                  </button>
                </div>
              </div>

              {config.scheduleActive && config.nextRun && (
                <div className="gtfs-schedule-next">
                  <ClockIcon size={16}/>
                  {t('pages.gtfs.nextSync')}<strong>{formatDate(config.nextRun)}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
