// Sprint 1 follow-up: Ferramentas Dev / Demo. Acesso restrito ao role
// "developer". Dispara endpoints placeholder no backend (apenas logs).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import './DevTools.css';

// ─── Ícones SVG inline ──────────────────────────────────────────────────────
const IconBus = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="14" rx="2"/>
    <path d="M4 11h16"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/>
    <path d="M7 7h2M15 7h2"/>
  </svg>
);
const IconPeople = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IconClock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IconUserPlus = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/>
    <line x1="23" y1="11" x2="17" y2="11"/>
  </svg>
);
const IconLayers = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12 2 22 8.5 12 15 2 8.5 12 2"/>
    <polyline points="2 15.5 12 22 22 15.5"/>
  </svg>
);
const IconActivity = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);
const IconAlert = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

export default function DevTools() {
  const { t } = useTranslation();
  const [buses, setBuses] = useState([]);

  // ─── form state ──────────────────────────────────────────────────────────
  const [busBatchCount, setBusBatchCount] = useState('5');
  const [busBatchLoading, setBusBatchLoading] = useState(false);
  const [busBatchMsg, setBusBatchMsg] = useState(null);

  const [driverBatchCount, setDriverBatchCount] = useState('5');
  const [driverBatchLoading, setDriverBatchLoading] = useState(false);
  const [driverBatchMsg, setDriverBatchMsg] = useState(null);

  const [delayBusId, setDelayBusId] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('30');
  const [delayLoading, setDelayLoading] = useState(false);
  const [delayMsg, setDelayMsg] = useState(null);

  const [paxBusId, setPaxBusId] = useState('');
  const [paxCount, setPaxCount] = useState('5');
  const [paxLoading, setPaxLoading] = useState(false);
  const [paxMsg, setPaxMsg] = useState(null);

  // ─── load buses ──────────────────────────────────────────────────────────
  const reloadBuses = () => {
    api.get('/buses').then(r => setBuses(r.data || [])).catch(() => setBuses([]));
  };
  useEffect(() => { reloadBuses(); }, []);

  // ─── handlers ────────────────────────────────────────────────────────────
  const handleBusBatch = async (e) => {
    e.preventDefault();
    setBusBatchLoading(true); setBusBatchMsg(null);
    try {
      const res = await api.post(`/buses/batch?count=${Number(busBatchCount)}`);
      const created = Array.isArray(res.data) ? res.data.length : Number(busBatchCount);
      setBusBatchMsg({ kind: 'ok', text: t('pages.devTools.busBatchCard.success', { count: created }) });
      reloadBuses();
    } catch {
      setBusBatchMsg({ kind: 'err', text: t('pages.devTools.busBatchCard.error') });
    } finally { setBusBatchLoading(false); }
  };

  const handleDriverBatch = async (e) => {
    e.preventDefault();
    setDriverBatchLoading(true); setDriverBatchMsg(null);
    try {
      const res = await api.post(`/users/drivers/batch?count=${Number(driverBatchCount)}`);
      const created = Array.isArray(res.data) ? res.data.length : Number(driverBatchCount);
      setDriverBatchMsg({ kind: 'ok', text: t('pages.devTools.driverBatchCard.success', { count: created }) });
    } catch {
      setDriverBatchMsg({ kind: 'err', text: t('pages.devTools.driverBatchCard.error') });
    } finally { setDriverBatchLoading(false); }
  };

  const handleDelay = async (e) => {
    e.preventDefault();
    setDelayLoading(true); setDelayMsg(null);
    try {
      await api.post('/dev/simulate/bus-delay', { busId: Number(delayBusId), delaySeconds: Number(delaySeconds) });
      setDelayMsg({ kind: 'ok', text: t('pages.devTools.simulateDelayCard.success') });
    } catch {
      setDelayMsg({ kind: 'err', text: t('pages.devTools.simulateDelayCard.error') });
    } finally { setDelayLoading(false); }
  };

  const handlePax = async (e) => {
    e.preventDefault();
    setPaxLoading(true); setPaxMsg(null);
    try {
      await api.post('/dev/simulate/add-passengers', { busId: Number(paxBusId), count: Number(paxCount) });
      setPaxMsg({ kind: 'ok', text: t('pages.devTools.addPaxCard.success') });
    } catch {
      setPaxMsg({ kind: 'err', text: t('pages.devTools.addPaxCard.error') });
    } finally { setPaxLoading(false); }
  };

  // ─── render ──────────────────────────────────────────────────────────────
  return (
    <div className="dt-page">
      <div className="page-header">
        <div>
          <h1>{t('pages.devTools.title')}</h1>
          <p className="page-subtitle">{t('pages.devTools.subtitle')}</p>
        </div>
      </div>

      {/* Secção 1: geração em batch */}
      <section className="dt-section">
        <div className="dt-section-header">
          <IconLayers />
          <h2>{t('pages.devTools.batchSection')}</h2>
        </div>
        <div className="dt-grid">
          {/* Bus batch */}
          <form className="dt-card" onSubmit={handleBusBatch}>
            <div className="dt-card-head">
              <span className="dt-card-icon"><IconBus /></span>
              <div>
                <h3 className="dt-card-title">{t('pages.devTools.busBatchCard.title')}</h3>
                <p className="dt-card-desc">{t('pages.devTools.busBatchCard.description')}</p>
              </div>
            </div>
            <div className="dt-form">
              <div className="dt-field">
                <label>{t('pages.devTools.busBatchCard.count')}</label>
                <input type="number" min="1" max="50" value={busBatchCount}
                       onChange={e => setBusBatchCount(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busBatchLoading}>
                {busBatchLoading ? t('pages.devTools.busBatchCard.submitting') : t('pages.devTools.busBatchCard.submit')}
              </button>
              {busBatchMsg && (
                <p className={`dt-msg dt-msg--${busBatchMsg.kind}`}>{busBatchMsg.text}</p>
              )}
            </div>
          </form>

          {/* Driver batch */}
          <form className="dt-card" onSubmit={handleDriverBatch}>
            <div className="dt-card-head">
              <span className="dt-card-icon"><IconUserPlus /></span>
              <div>
                <h3 className="dt-card-title">{t('pages.devTools.driverBatchCard.title')}</h3>
                <p className="dt-card-desc">{t('pages.devTools.driverBatchCard.description')}</p>
              </div>
            </div>
            <div className="dt-hint">
              <IconAlert />
              <span>
                <strong>{t('pages.drivers.batchPasswordHintTitle')}</strong>{' '}
                {t('pages.drivers.batchPasswordHintBody')}
              </span>
            </div>
            <div className="dt-form">
              <div className="dt-field">
                <label>{t('pages.devTools.driverBatchCard.count')}</label>
                <input type="number" min="1" max="50" value={driverBatchCount}
                       onChange={e => setDriverBatchCount(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={driverBatchLoading}>
                {driverBatchLoading ? t('pages.devTools.driverBatchCard.submitting') : t('pages.devTools.driverBatchCard.submit')}
              </button>
              {driverBatchMsg && (
                <p className={`dt-msg dt-msg--${driverBatchMsg.kind}`}>{driverBatchMsg.text}</p>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Secção 2: simulações em tempo real */}
      <section className="dt-section">
        <div className="dt-section-header">
          <IconActivity />
          <h2>{t('pages.devTools.simulateSection')}</h2>
          <span className="dt-section-badge">{t('pages.devTools.stubBadge')}</span>
        </div>
        <div className="dt-grid">
          {/* Delay */}
          <form className="dt-card" onSubmit={handleDelay}>
            <div className="dt-card-head">
              <span className="dt-card-icon dt-card-icon--warn"><IconClock /></span>
              <div>
                <h3 className="dt-card-title">{t('pages.devTools.simulateDelayCard.title')}</h3>
                <p className="dt-card-desc">{t('pages.devTools.simulateDelayCard.description', 'Atraso virtual aplicado ao próximo ciclo de telemetria do autocarro.')}</p>
              </div>
            </div>
            <div className="dt-form">
              <div className="dt-field">
                <label>{t('pages.devTools.bus')}</label>
                <select value={delayBusId} onChange={e => setDelayBusId(e.target.value)} required>
                  <option value="">{t('pages.devTools.selectBus')}</option>
                  {buses.map(b => (<option key={b.id} value={b.id}>{b.busCode}</option>))}
                </select>
              </div>
              <div className="dt-field">
                <label>{t('pages.devTools.simulateDelayCard.delaySeconds')}</label>
                <input type="number" min="1" value={delaySeconds}
                       onChange={e => setDelaySeconds(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={delayLoading || !delayBusId}>
                {t('pages.devTools.simulateDelayCard.submit')}
              </button>
              {delayMsg && (
                <p className={`dt-msg dt-msg--${delayMsg.kind}`}>{delayMsg.text}</p>
              )}
            </div>
          </form>

          {/* Passengers */}
          <form className="dt-card" onSubmit={handlePax}>
            <div className="dt-card-head">
              <span className="dt-card-icon"><IconPeople /></span>
              <div>
                <h3 className="dt-card-title">{t('pages.devTools.addPaxCard.title')}</h3>
                <p className="dt-card-desc">{t('pages.devTools.addPaxCard.description', 'Incrementa o número simulado de passageiros para testar deteção de fraude.')}</p>
              </div>
            </div>
            <div className="dt-form">
              <div className="dt-field">
                <label>{t('pages.devTools.bus')}</label>
                <select value={paxBusId} onChange={e => setPaxBusId(e.target.value)} required>
                  <option value="">{t('pages.devTools.selectBus')}</option>
                  {buses.map(b => (<option key={b.id} value={b.id}>{b.busCode}</option>))}
                </select>
              </div>
              <div className="dt-field">
                <label>{t('pages.devTools.addPaxCard.count')}</label>
                <input type="number" min="1" value={paxCount}
                       onChange={e => setPaxCount(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={paxLoading || !paxBusId}>
                {t('pages.devTools.addPaxCard.submit')}
              </button>
              {paxMsg && (
                <p className={`dt-msg dt-msg--${paxMsg.kind}`}>{paxMsg.text}</p>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
