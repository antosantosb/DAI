import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import './FleetHealth.css';

/**
 * Sprint 4 (3.2): FleetHealth — Material Circulante.
 * KPIs por powertrain + tabela de buses com diagnostic mais recente.
 */
export default function FleetHealth() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ activeByPowertrain24h: [], avgSoh24h: 0, avgDpf24h: 0 });
  const [latest, setLatest] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      api.get('/diagnostics/stats').then(r => r.data || stats),
      api.get('/diagnostics/latest').then(r => r.data || []),
      api.get('/buses').then(r => r.data || []),
    ]).then(([s, l, b]) => {
      setStats(s); setLatest(l); setBuses(b);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  // count buses by powertrain (do CRUD, nao depende de diagnostics)
  const ptCount = (pt) => buses.filter(b => b.powertrain === pt && b.status !== 'DECOMMISSIONED').length;
  const totalActive = buses.filter(b => b.status !== 'DECOMMISSIONED').length;

  const pctClass = (n) => n == null ? '—' : (n >= 80 ? 'good' : n >= 60 ? 'warn' : 'bad');

  return (
    <div className="fleet-health-page">
      <header className="fh-header">
        <h1>{t('pages.fleetHealth.title', 'Saúde da Frota')}</h1>
        <p className="fh-subtitle">
          {t('pages.fleetHealth.subtitle', 'Material circulante tri-powertrain (DIESEL / ELECTRIC / CNG).')}
        </p>
      </header>

      {/* KPIs */}
      <div className="fh-kpis">
        <Kpi label={t('pages.fleetHealth.kpiTotal', 'Total activos')} value={totalActive} />
        <Kpi label="DIESEL" value={ptCount('DIESEL')} color="#92400e" />
        <Kpi label="ELECTRIC" value={ptCount('ELECTRIC')} color="#166534" />
        <Kpi label="CNG" value={ptCount('CNG')} color="#075985" />
        <Kpi label={t('pages.fleetHealth.kpiSoh', 'SoH médio (electric)')} value={`${stats.avgSoh24h}%`} />
        <Kpi label={t('pages.fleetHealth.kpiDpf', 'DPF médio (diesel)')} value={`${stats.avgDpf24h}%`} />
      </div>

      {loading && <p style={{ padding: '0 2rem' }}>{t('common.loading', 'A carregar...')}</p>}

      {/* Diagnostic mais recente por bus */}
      <section className="fh-section">
        <h2>{t('pages.fleetHealth.diagTitle', 'Diagnóstico recente por autocarro')}</h2>
        <table className="fh-table">
          <thead>
            <tr>
              <th>Bus</th>
              <th>{t('pages.fleetHealth.colPowertrain', 'Powertrain')}</th>
              <th>{t('pages.fleetHealth.colOdo', 'Odómetro (km)')}</th>
              <th>{t('pages.fleetHealth.colDiesel', 'DIESEL: Fuel/AdBlue/DPF')}</th>
              <th>{t('pages.fleetHealth.colElectric', 'ELECTRIC: SoC/SoH')}</th>
              <th>{t('pages.fleetHealth.colCng', 'CNG: Tanque/Pressão')}</th>
              <th>{t('pages.fleetHealth.colDtc', 'DTC')}</th>
              <th>{t('pages.fleetHealth.colLast', 'Última leitura')}</th>
            </tr>
          </thead>
          <tbody>
            {latest.map(d => (
              <tr key={d.id}>
                <td><code>{d.busId}</code></td>
                <td>
                  <span className={`fh-pt fh-pt--${(d.powertrain || '').toLowerCase()}`}>{d.powertrain}</span>
                </td>
                <td>{d.odometerKm != null ? Number(d.odometerKm).toLocaleString('pt-PT') : '—'}</td>
                <td>
                  {d.powertrain === 'DIESEL'
                    ? `${d.fuelLevelPct ?? '—'}% / ${d.adblueLevelPct ?? '—'}% / `
                      + `${d.dpfSootPct ?? '—'}%`
                    : '—'}
                </td>
                <td>
                  {d.powertrain === 'ELECTRIC'
                    ? <span className={`fh-pct fh-pct--${pctClass(d.socPct)}`}>{d.socPct ?? '—'}% / {d.sohPct ?? '—'}%</span>
                    : '—'}
                </td>
                <td>
                  {d.powertrain === 'CNG'
                    ? `${d.cngLevelPct ?? '—'}% / ${d.cngPressureBar ?? '—'} bar`
                    : '—'}
                </td>
                <td>{d.dtcCodes ? <span className="fh-dtc">{d.dtcCodes}</span> : '—'}</td>
                <td>{d.recordedAt ? new Date(d.recordedAt).toLocaleTimeString('pt-PT') : '—'}</td>
              </tr>
            ))}
            {!loading && latest.length === 0 && (
              <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
                {t('pages.fleetHealth.empty', 'Sem diagnósticos ainda. O simulador começará a enviar quando os buses estiverem em operação.')}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="fh-kpi">
      <div className="fh-kpi-label" style={color ? { color } : null}>{label}</div>
      <div className="fh-kpi-value">{value}</div>
    </div>
  );
}
