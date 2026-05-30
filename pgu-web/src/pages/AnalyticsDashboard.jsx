import { useEffect, useState, useRef, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area,
} from 'recharts';
import api from '../services/api';
import HeatmapAnalytics from '../components/HeatmapAnalytics';
import './Buses.css';
import './AnalyticsDashboard.css';

const CHART = {
  passengers:  '#0084BD',
  buses:       '#10b981',
  active:      '#10b981',
  atStop:      '#009BDB',
  stopping:    '#f59e0b',
  delayed:     '#ef4444',
  stopped:     '#94a3b8',
  avgPax:      '#009BDB',
  maxPax:      '#cbd5e1',
  speed:       '#f59e0b',
  congestion:  '#ef4444',
  axis:        '#94a3b8',
  grid:        '#f1f5f9',
};

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
  fontSize: 13,
};

const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : v);

const DelaysTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0) || 1;
  return (
    <div style={{ ...TOOLTIP_STYLE, padding: '8px 12px', background: '#fff' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, fontSize: 12, lineHeight: 1.5 }}>
          {p.name}: {((p.value / total) * 100).toFixed(1)}%
        </div>
      ))}
    </div>
  );
};

const getOccupancyColor = (rate) => {
  if (!rate) return '#94a3b8';
  if (rate < 35) return '#10b981'; // low/comfortable
  if (rate < 70) return '#f59e0b'; // medium
  return '#ef4444'; // high
};

// Sprint 2 (R.ICP.04): cor de uma celula do heatmap de ocupacao (rota x hora).
// Gradiente verde (vazio) -> amarelo -> vermelho (cheio). Sem amostras = celula
// vazia (transparente). pct em 0..100.
const getOccupancyCellColor = (pct) => {
  if (pct == null || Number.isNaN(pct)) return 'transparent';
  const clamped = Math.max(0, Math.min(100, pct));
  const hue = 140 - (clamped / 100) * 140; // 140 (verde) .. 0 (vermelho)
  return `hsl(${hue}, 70%, 45%)`;
};

// Heatmap de frequência: headway (min) -> cor. Verde = mais frequente
// (headway baixo), vermelho = menos frequente (headway alto). Sem dados = cinza.
const HEADWAY_MIN = 5;   // <= 5 min: muito frequente (verde)
const HEADWAY_MAX = 60;  // >= 60 min: pouco frequente (vermelho)
const getHeadwayColor = (headway) => {
  if (headway == null || Number.isNaN(headway)) return 'var(--color-border)';
  const clamped = Math.max(HEADWAY_MIN, Math.min(HEADWAY_MAX, headway));
  // 0 (verde) -> 1 (vermelho)
  const ratio = (clamped - HEADWAY_MIN) / (HEADWAY_MAX - HEADWAY_MIN);
  const hue = 140 - ratio * 140; // 140 (verde) .. 0 (vermelho)
  return `hsl(${hue}, 70%, 45%)`;
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function AnalyticsDashboard() {
  const { t } = useTranslation();
  const TABS = [
    { key: 'fleet', label: t('pages.analytics.tabFleet') },
    { key: 'buses', label: t('pages.analytics.tabBuses') },
    { key: 'geo', label: t('pages.analytics.tabGeo') },
    { key: 'occupancy', label: t('pages.analytics.tabOccupancy') },
    { key: 'coverage', label: t('pages.analytics.tabCoverage') },
  ];
  const [fleetData, setFleetData]             = useState([]);
  const [delayData, setDelayData]             = useState([]);
  const [efficiencyData, setEfficiencyData]   = useState([]);
  const [speedData, setSpeedData]             = useState([]);
  const [congestionData, setCongestionData]   = useState([]);
  // Sprint 2 (R.ICP.04): ocupacao media por rota x hora (heatmap).
  const [occupancyData, setOccupancyData]     = useState([]);
  // Cobertura/frequência: baseada no horário planeado, não usa os filtros de
  // data/hora. Carregada uma única vez ao montar o componente.
  const [coverageData, setCoverageData]       = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [activeTab, setActiveTab]             = useState('fleet');
  
  // Dynamic filter states
  const [startDate, setStartDate]             = useState('');
  const [endDate, setEndDate]                 = useState('');
  const [startHour, setStartHour]             = useState('');
  const [endHour, setEndHour]                 = useState('');
  const [isFiltered, setIsFiltered]           = useState(false);

  // Selector for efficiency metric: 'passengers' or 'occupancy'
  const [efficiencyMetric, setEfficiencyMetric] = useState('passengers');

  const abortRef = useRef(null);

  const fetchData = async (forceWithFilters = false) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const params = {};
    if (isFiltered || forceWithFilters) {
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (startHour) params.startHour = startHour;
      if (endHour) params.endHour = endHour;
    }

    setLoading(true);
    try {
      const [fleet, delays, eff, speed, cong, occ] = await Promise.all([
        api.get('/analytics/fleet-occupancy', { params, signal: ctrl.signal }),
        api.get('/analytics/route-delays',    { params, signal: ctrl.signal }),
        api.get('/analytics/bus-efficiency',  { params, signal: ctrl.signal }),
        api.get('/analytics/speed-over-time', { params, signal: ctrl.signal }),
        api.get('/analytics/congestion',      { params, signal: ctrl.signal }),
        api.get('/analytics/occupancy',       { params, signal: ctrl.signal }),
      ]);
      setFleetData(fleet.data || []);
      const normalized = (delays.data || []).map(d => ({
        ...d,
        atStopCount: (d.atStopCount || 0) + (d.stoppedCount || 0),
        stoppedCount: 0,
        stoppingCount: 0,
      }));
      setDelayData(normalized);
      setEfficiencyData(eff.data || []);
      setSpeedData(speed.data || []);
      setCongestionData(cong.data || []);
      // 204 No Content -> occ.data === '' (axios). Normaliza para [].
      setOccupancyData(Array.isArray(occ.data) ? occ.data : []);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        console.error('Error fetching analytics', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isFiltered) {
      fetchData();
      const iv = setInterval(fetchData, 60_000);
      return () => {
        clearInterval(iv);
        abortRef.current?.abort();
      };
    } else {
      fetchData();
    }
  }, [isFiltered]);

  // Indicadores de cobertura/frequência: fetch único ao montar (sem filtros).
  useEffect(() => {
    const ctrl = new AbortController();
    api.get('/analytics/coverage', { signal: ctrl.signal })
      .then((res) => setCoverageData(res.data || null))
      .catch((err) => {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          console.error('Error fetching coverage indicators', err);
        }
      });
    return () => ctrl.abort();
  }, []);

  const handleFilter = (e) => {
    e?.preventDefault();
    setIsFiltered(true);
    fetchData(true);
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    setStartHour('');
    setEndHour('');
    setIsFiltered(false);
  };

  // KPI Calculations
  // 1. Fleet KPIs
  const peakPassengers = fleetData.length > 0
    ? Math.max(...fleetData.map(f => f.totalPassengers || 0))
    : 0;

  const avgActiveBuses = fleetData.length > 0
    ? (fleetData.reduce((acc, curr) => acc + (curr.activeBuses || 0), 0) / fleetData.length).toFixed(1)
    : 0;

  const avgFleetOccupancy = fleetData.length > 0
    ? (fleetData.reduce((acc, curr) => acc + (curr.occupancyRate || 0), 0) / fleetData.length).toFixed(1)
    : null;

  // 2. Bus Efficiency KPIs
  const overallAvgOccupancy = efficiencyData.length > 0
    ? (efficiencyData.reduce((acc, curr) => acc + (curr.avgOccupancyRate || 0), 0) / efficiencyData.length).toFixed(1)
    : null;

  const overallMaxOccupancy = efficiencyData.length > 0
    ? Math.max(...efficiencyData.map(e => e.maxOccupancyRate || 0)).toFixed(1)
    : null;

  const mostUtilizedBus = efficiencyData.length > 0
    ? efficiencyData.reduce((prev, current) => (prev.avgOccupancyRate > current.avgOccupancyRate) ? prev : current, efficiencyData[0])
    : null;

  // 3. Cobertura / Frequência (R.IVT.06)
  const geoCoveragePct = coverageData?.geographicCoveragePct ?? null;

  // Frequência -> matriz [linha][hora] para o heatmap.
  const freqRows = (() => {
    const list = coverageData?.frequencyByRouteHour || [];
    const byRoute = new Map();
    list.forEach((f) => {
      if (!byRoute.has(f.routeId)) {
        byRoute.set(f.routeId, {
          routeId: f.routeId,
          routeCode: f.routeCode,
          routeName: f.routeName,
          cells: {}, // hour -> { headway, trips }
        });
      }
      byRoute.get(f.routeId).cells[f.hour] = {
        headway: f.avgHeadwayMinutes,
        trips: f.tripCount,
      };
    });
    return Array.from(byRoute.values()).sort((a, b) =>
      String(a.routeCode).localeCompare(String(b.routeCode), undefined, { numeric: true }));
  })();

  const waitStops = coverageData?.waitTimeByStop || [];
  const worstStops = waitStops.slice(0, 10); // já vem ordenado DESC do backend
  const bestStops = waitStops.length > 0
    ? [...waitStops].sort((a, b) => a.avgWaitMinutes - b.avgWaitMinutes).slice(0, 10)
    : [];
  const maxWait = waitStops.length > 0
    ? Math.max(...waitStops.map(s => s.avgWaitMinutes || 0))
    : 0;
  const hasCoverage = !!coverageData &&
    (freqRows.length > 0 || waitStops.length > 0 || geoCoveragePct != null);

  // Sprint 2 (R.ICP.04): ocupacao -> matriz [rota][hora] para o heatmap.
  const occRows = (() => {
    const byRoute = new Map();
    (occupancyData || []).forEach((o) => {
      if (!byRoute.has(o.routeCode)) {
        byRoute.set(o.routeCode, { routeCode: o.routeCode, cells: {} });
      }
      byRoute.get(o.routeCode).cells[o.hour] = {
        pct: o.occupancyPct,
        onboard: o.avgOnboard,
        samples: o.samples,
      };
    });
    return Array.from(byRoute.values()).sort((a, b) =>
      String(a.routeCode).localeCompare(String(b.routeCode), undefined, { numeric: true }));
  })();
  const avgOccupancyAll = occupancyData.length > 0
    ? (occupancyData.reduce((acc, o) => acc + (o.occupancyPct || 0), 0) / occupancyData.length)
    : null;
  const peakOccupancy = occupancyData.length > 0
    ? occupancyData.reduce((prev, o) => ((o.occupancyPct || 0) > (prev.occupancyPct || 0) ? o : prev), occupancyData[0])
    : null;

  return (
    <div className="analytics-page">
      <div className="page-header">
        <div>
          <h1>{t('pages.analytics.pageTitle')}</h1>
          <p className="page-subtitle">{t('pages.analytics.pageSubtitle')}</p>
        </div>
        <a
          href={`${window.location.origin}/metabase/`}
          target="_blank"
          rel="noopener noreferrer"
          className="metabase-link"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" />
          </svg>
          {t('pages.analytics.metabase')}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>

      {/* Dynamic Filter Card */}
      <form onSubmit={handleFilter} className="analytics-filter-card">
        <div className="filter-group">
          <label>{t('pages.analytics.startDate')}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>{t('pages.analytics.endDate')}</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>{t('pages.analytics.startHour')}</label>
          <input
            type="time"
            value={startHour}
            onChange={(e) => setStartHour(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>{t('pages.analytics.endHour')}</label>
          <input
            type="time"
            value={endHour}
            onChange={(e) => setEndHour(e.target.value)}
          />
        </div>
        <div className="filter-actions">
          <button type="submit" className="btn-filter">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {t('pages.analytics.filter')}
          </button>
          {(isFiltered || startDate || endDate || startHour || endHour) && (
            <button type="button" onClick={handleClear} className="btn-clear">
              {t('pages.analytics.clear')}
            </button>
          )}
        </div>
      </form>

      {/* Sub-tabs */}
      <div className="analytics-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`analytics-tab${activeTab === t.key ? ' analytics-tab--active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="analytics-loading">{t('pages.analytics.loadingCharts')}</p>
      ) : (
        <>
          {/* ═══ TAB FROTA ═══ */}
          {activeTab === 'fleet' && (
            <>
              {/* KPIs Row */}
              <div className="analytics-kpi-row">
                <div className="analytics-kpi-card">
                  <span className="kpi-value">{avgFleetOccupancy ? `${avgFleetOccupancy}%` : '—'}</span>
                  <span className="kpi-label">{t('pages.analytics.kpiAvgOccupancy')}</span>
                </div>
                <div className="analytics-kpi-card">
                  <span className="kpi-value">{peakPassengers}</span>
                  <span className="kpi-label">{t('pages.analytics.kpiPeakPassengers')}</span>
                </div>
                <div className="analytics-kpi-card">
                  <span className="kpi-value">{avgActiveBuses}</span>
                  <span className="kpi-label">{t('pages.analytics.kpiAvgActiveBuses')}</span>
                </div>
              </div>

              <div className="analytics-grid">
                <section className="bus-card analytics-card">
                  <h3>{t('pages.analytics.fleetEvolution')}</h3>
                  <div className="chart-container chart-container--lg">
                    <ResponsiveContainer>
                      <LineChart data={fleetData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                        <XAxis dataKey="minute" stroke={CHART.axis} tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left"  stroke={CHART.passengers} tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="right" orientation="right" stroke={CHART.buses} tick={{ fontSize: 12 }} />
                        <RechartsTooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value, name) => {
                            if (name === t('pages.analytics.fleetOccupancyPct')) return [`${fmt1(value)}%`, name];
                            return [value, name];
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 13 }} />
                        <Line yAxisId="left"  type="monotone" dataKey="totalPassengers" name={t('pages.analytics.totalPassengers')} stroke={CHART.passengers} strokeWidth={2.5} activeDot={{ r: 6 }} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="activeBuses"     name={t('pages.analytics.activeBuses')}   stroke={CHART.buses}      strokeWidth={2.5} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="occupancyRate"   name={t('pages.analytics.fleetOccupancyPct')} stroke="#f59e0b"        strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {fleetData.length === 0 && <p className="analytics-empty">{t('pages.analytics.noFleetData')}</p>}
                </section>

                <section className="bus-card analytics-card">
                  <h3>{t('pages.analytics.stateDistribution')}</h3>
                  <p className="analytics-subtitle">
                    {t('pages.analytics.stateSubtitlePrefix')}<span style={{color: CHART.active, fontWeight:600}}>{t('pages.analytics.stateActive')}</span>.
                  </p>
                  <div className="chart-container chart-container--lg">
                    <ResponsiveContainer>
                      <BarChart data={delayData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }} stackOffset="expand" barCategoryGap="25%">
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                        <XAxis dataKey="routeCode" stroke={CHART.axis} tick={{ fontSize: 12 }} />
                        <YAxis stroke={CHART.axis} tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
                        <RechartsTooltip cursor={{ fill: CHART.grid }} content={<DelaysTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 13 }} />
                        <Bar dataKey="activeCount"   stackId="s" name={t('pages.analytics.stateActive')}     fill={CHART.active} />
                        <Bar dataKey="atStopCount"   stackId="s" name={t('pages.analytics.stateAtStop')} fill={CHART.atStop} />
                        <Bar dataKey="delayedCount"  stackId="s" name={t('pages.analytics.stateDelayed')}   fill={CHART.delayed} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {delayData.length === 0 && <p className="analytics-empty">{t('pages.analytics.noOperationalEvents')}</p>}
                </section>
              </div>
            </>
          )}

          {/* ═══ TAB AUTOCARROS ═══ */}
          {activeTab === 'buses' && (
            <>
              {/* KPIs Row */}
              <div className="analytics-kpi-row">
                <div className="analytics-kpi-card">
                  <span className="kpi-value">{overallAvgOccupancy ? `${overallAvgOccupancy}%` : '—'}</span>
                  <span className="kpi-label">{t('pages.analytics.kpiOverallAvgOccupancy')}</span>
                </div>
                <div className="analytics-kpi-card">
                  <span className="kpi-value">{overallMaxOccupancy ? `${overallMaxOccupancy}%` : '—'}</span>
                  <span className="kpi-label">{t('pages.analytics.kpiOverallMaxOccupancy')}</span>
                </div>
                <div className="analytics-kpi-card">
                  <span className="kpi-value">
                    {mostUtilizedBus ? `${mostUtilizedBus.busId} (${mostUtilizedBus.avgOccupancyRate.toFixed(1)}%)` : '—'}
                  </span>
                  <span className="kpi-label">{t('pages.analytics.kpiMostUtilized')}</span>
                </div>
              </div>

              <div className="analytics-grid">
                <section className="bus-card analytics-card">
                  <div className="card-header-actions">
                    <h3>{t('pages.analytics.fleetEfficiency')}</h3>
                    <div className="metric-toggle">
                      <button
                        className={`btn-toggle ${efficiencyMetric === 'passengers' ? 'active' : ''}`}
                        onClick={() => setEfficiencyMetric('passengers')}
                      >
                        {t('pages.analytics.passengers')}
                      </button>
                      <button
                        className={`btn-toggle ${efficiencyMetric === 'occupancy' ? 'active' : ''}`}
                        onClick={() => setEfficiencyMetric('occupancy')}
                      >
                        {t('pages.analytics.occupancyRateLabel')}
                      </button>
                    </div>
                  </div>

                  <div className="chart-container chart-container--xl">
                    <ResponsiveContainer>
                      <BarChart data={efficiencyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                        <XAxis type="number" stroke={CHART.axis} tick={{ fontSize: 12 }} unit={efficiencyMetric === 'occupancy' ? '%' : ''} domain={efficiencyMetric === 'occupancy' ? [0, 100] : ['auto', 'auto']} />
                        <YAxis dataKey="busId" type="category" stroke={CHART.axis} width={80} tick={{ fontSize: 12 }} />
                        <RechartsTooltip cursor={{ fill: CHART.grid }} contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [`${fmt1(value)}${efficiencyMetric === 'occupancy' ? '%' : ''}`, name]} />
                        <Legend wrapperStyle={{ fontSize: 13 }} />
                        {efficiencyMetric === 'passengers' ? (
                          <>
                            <Bar dataKey="avgPassengers" name={t('pages.analytics.avgPax')}  fill={CHART.avgPax} radius={[0, 4, 4, 0]} />
                            <Bar dataKey="maxPassengers" name={t('pages.analytics.maxPax')} fill={CHART.maxPax} radius={[0, 4, 4, 0]} />
                          </>
                        ) : (
                          <>
                            <Bar dataKey="avgOccupancyRate" name={t('pages.analytics.avgOccupancyPct')}  fill={CHART.avgPax} radius={[0, 4, 4, 0]} />
                            <Bar dataKey="maxOccupancyRate" name={t('pages.analytics.maxOccupancyPct')} fill={CHART.maxPax} radius={[0, 4, 4, 0]} />
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {efficiencyData.length === 0 && <p className="analytics-empty">{t('pages.analytics.noEfficiency')}</p>}
                </section>

                <section className="bus-card analytics-card">
                  <h3>{t('pages.analytics.avgFleetSpeed')}</h3>
                  <div className="chart-container chart-container--lg">
                    <ResponsiveContainer>
                      <AreaChart data={speedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <defs>
                          <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART.speed} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={CHART.speed} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                        <XAxis dataKey="minute" stroke={CHART.axis} tick={{ fontSize: 12 }} />
                        <YAxis stroke={CHART.axis} tick={{ fontSize: 12 }} unit=" km/h" />
                        <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${fmt1(v)} km/h`, t('pages.analytics.avgSpeedLabel')]} />
                        <Area type="monotone" dataKey="avgSpeed" stroke={CHART.speed} strokeWidth={2.5} fill="url(#speedGrad)" dot={false} activeDot={{ r: 5 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {speedData.length === 0 && <p className="analytics-empty">{t('pages.analytics.noSpeedData')}</p>}
                </section>
              </div>
            </>
          )}

          {/* ═══ TAB GEOGRÁFICO ═══ */}
          {activeTab === 'geo' && (
            <div className="analytics-grid">
              <section className="bus-card analytics-card">
                <h3>{t('pages.analytics.hotZones')}</h3>
                <HeatmapAnalytics />
              </section>

              <section className="bus-card analytics-card">
                <h3>{t('pages.analytics.congestionPoints')}</h3>
                <p className="analytics-subtitle">
                  {t('pages.analytics.congestionSubtitle')}
                </p>
                {congestionData.length === 0 ? (
                  <p className="analytics-empty">{t('pages.analytics.noCongestion')}</p>
                ) : (
                  <>
                    <div className="congestion-summary">
                      <div className="congestion-stat">
                        <span className="congestion-stat-value">{congestionData.length}</span>
                        <span className="congestion-stat-label">{t('pages.analytics.congestionRecords')}</span>
                      </div>
                      <div className="congestion-stat">
                        <span className="congestion-stat-value">{new Set(congestionData.map(c => c.busId)).size}</span>
                        <span className="congestion-stat-label">{t('pages.analytics.congestionBuses')}</span>
                      </div>
                      <div className="congestion-stat">
                        <span className="congestion-stat-value">{new Set(congestionData.map(c => c.routeCode).filter(Boolean)).size}</span>
                        <span className="congestion-stat-label">{t('pages.analytics.congestionRoutes')}</span>
                      </div>
                      <div className="congestion-stat">
                        <span className="congestion-stat-value">
                          {Math.max(...congestionData.map(c => c.occupancyRate || 0)).toFixed(1)}<small>%</small>
                        </span>
                        <span className="congestion-stat-label">{t('pages.analytics.congestionMaxOcc')}</span>
                      </div>
                    </div>
                    <div className="congestion-table-wrap">
                      <table className="congestion-table">
                        <thead>
                          <tr>
                            <th>{t('pages.analytics.tableBus')}</th>
                            <th>{t('pages.analytics.tableRoute')}</th>
                            <th>{t('pages.analytics.tableSpeed')}</th>
                            <th>{t('pages.analytics.tablePassengers')}</th>
                            <th>{t('pages.analytics.tableOccupancy')}</th>
                            <th>{t('pages.analytics.tableTime')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {congestionData.slice(0, 30).map((c, i) => (
                            <tr key={i}>
                              <td className="congestion-bus">{c.busId}</td>
                              <td><span className="congestion-route-badge">{c.routeCode || '—'}</span></td>
                              <td className="congestion-speed">{fmt1(c.speedKmh)} km/h</td>
                              <td>{c.passengerCount}</td>
                              <td>
                                <div className="occupancy-progress-bar-container">
                                  <div
                                    className="occupancy-progress-bar"
                                    style={{
                                      width: `${Math.min(c.occupancyRate || 0, 100)}%`,
                                      backgroundColor: getOccupancyColor(c.occupancyRate)
                                    }}
                                  />
                                  <span className="occupancy-progress-text">{fmt1(c.occupancyRate)}%</span>
                                </div>
                              </td>
                              <td className="congestion-time">{c.recordedAt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {/* ═══ TAB OCUPAÇÃO (R.ICP.04) ═══ */}
          {activeTab === 'occupancy' && (
            <>
              <div className="analytics-kpi-row">
                <div className="analytics-kpi-card">
                  <span className="kpi-value">{avgOccupancyAll != null ? `${fmt1(avgOccupancyAll)}%` : '—'}</span>
                  <span className="kpi-label">{t('pages.analytics.occAvgKpi')}</span>
                </div>
                <div className="analytics-kpi-card">
                  <span className="kpi-value">
                    {peakOccupancy ? `${fmt1(peakOccupancy.occupancyPct)}%` : '—'}
                  </span>
                  <span className="kpi-label">{t('pages.analytics.occPeakKpi')}</span>
                </div>
                <div className="analytics-kpi-card">
                  <span className="kpi-value">
                    {peakOccupancy ? t('pages.analytics.occPeakAt', { route: peakOccupancy.routeCode, hour: peakOccupancy.hour }) : '—'}
                  </span>
                  <span className="kpi-label">{t('pages.analytics.occPeakWhenKpi')}</span>
                </div>
              </div>

              <section className="bus-card analytics-card">
                <h3>{t('pages.analytics.occTitle')}</h3>
                <p className="analytics-subtitle">{t('pages.analytics.occSubtitle')}</p>
                {occRows.length === 0 ? (
                  <p className="analytics-empty">{t('pages.analytics.noOccupancyData')}</p>
                ) : (
                  <>
                    <div className="freq-heatmap-scroll">
                      <div className="freq-heatmap">
                        <div className="freq-heatmap-corner">{t('pages.analytics.occRouteHeader')}</div>
                        {HOURS.map((h) => (
                          <div key={`oh-${h}`} className="freq-heatmap-hhead">{h}</div>
                        ))}
                        {occRows.map((row) => (
                          <Fragment key={row.routeCode}>
                            <div className="freq-heatmap-rowhead" title={row.routeCode}>
                              {row.routeCode}
                            </div>
                            {HOURS.map((h) => {
                              const cell = row.cells[h];
                              const pct = cell?.pct;
                              const title = (cell && pct != null)
                                ? t('pages.analytics.occCellTitle', {
                                    route: row.routeCode,
                                    hour: h,
                                    pct: fmt1(pct),
                                    onboard: fmt1(cell.onboard),
                                    samples: cell.samples,
                                  })
                                : t('pages.analytics.occCellTitleNone', { route: row.routeCode, hour: h });
                              return (
                                <div
                                  key={`${row.routeCode}-${h}`}
                                  className="freq-heatmap-cell"
                                  style={{ background: cell ? getOccupancyCellColor(pct) : 'transparent' }}
                                  title={title}
                                >
                                  {cell && pct != null ? Math.round(pct) : ''}
                                </div>
                              );
                            })}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                    <div className="freq-legend">
                      <span className="freq-legend-label">{t('pages.analytics.occLegendLow')}</span>
                      <span className="freq-legend-swatch" style={{ background: getOccupancyCellColor(10) }} />
                      <span className="freq-legend-swatch" style={{ background: getOccupancyCellColor(50) }} />
                      <span className="freq-legend-swatch" style={{ background: getOccupancyCellColor(90) }} />
                      <span className="freq-legend-label">{t('pages.analytics.occLegendHigh')}</span>
                      <span className="freq-legend-swatch" style={{ background: 'transparent', border: '1px solid var(--color-border)' }} />
                      <span className="freq-legend-label">{t('pages.analytics.occLegendNone')}</span>
                      <span className="freq-legend-unit">({t('pages.analytics.occLegendUnit')})</span>
                    </div>
                  </>
                )}
              </section>
            </>
          )}

          {/* ═══ TAB COBERTURA E FREQUÊNCIA ═══ */}
          {activeTab === 'coverage' && (
            <>
              <div className="analytics-card bus-card" style={{ marginBottom: 24 }}>
                <h3>{t('pages.analytics.coverageTitle')}</h3>
                <p className="analytics-subtitle">{t('pages.analytics.coverageSubtitle')}</p>
              </div>

              {!hasCoverage ? (
                <p className="analytics-empty">{t('pages.analytics.noCoverageData')}</p>
              ) : (
                <div className="analytics-grid">
                  {/* KPI: cobertura geográfica */}
                  <section className="bus-card analytics-card">
                    <h3>{t('pages.analytics.geoCoverageTitle')}</h3>
                    <p className="analytics-subtitle">{t('pages.analytics.geoCoverageDesc')}</p>
                    <div className="coverage-kpi">
                      <span className="coverage-kpi-value">
                        {geoCoveragePct != null ? fmt1(geoCoveragePct) : '—'}
                        <small>{t('pages.analytics.coverageUnitPct')}</small>
                      </span>
                    </div>
                    <div
                      className="coverage-bar-track"
                      role="progressbar"
                      aria-label={t('pages.analytics.geoCoverageBarLabel')}
                      aria-valuenow={geoCoveragePct != null ? Math.round(geoCoveragePct) : 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="coverage-bar-fill"
                        style={{ width: `${Math.min(geoCoveragePct || 0, 100)}%` }}
                      />
                    </div>
                  </section>

                  {/* Heatmap linha x hora */}
                  <section className="bus-card analytics-card">
                    <h3>{t('pages.analytics.frequencyTitle')}</h3>
                    <p className="analytics-subtitle">{t('pages.analytics.frequencyDesc')}</p>
                    {freqRows.length === 0 ? (
                      <p className="analytics-empty">{t('pages.analytics.noCoverageData')}</p>
                    ) : (
                      <>
                        <div className="freq-heatmap-scroll">
                          <div className="freq-heatmap">
                            {/* Cabeçalho de horas */}
                            <div className="freq-heatmap-corner">
                              {t('pages.analytics.frequencyRouteHeader')}
                            </div>
                            {HOURS.map((h) => (
                              <div key={`h-${h}`} className="freq-heatmap-hhead">{h}</div>
                            ))}
                            {/* Linhas */}
                            {freqRows.map((row) => (
                              <Fragment key={row.routeId}>
                                <div
                                  className="freq-heatmap-rowhead"
                                  title={row.routeName || row.routeCode}
                                >
                                  {row.routeCode}
                                </div>
                                {HOURS.map((h) => {
                                  const cell = row.cells[h];
                                  const headway = cell?.headway;
                                  const title = (cell && headway != null)
                                    ? t('pages.analytics.frequencyCellTitle', {
                                        route: row.routeCode,
                                        hour: h,
                                        headway: fmt1(headway),
                                        trips: cell.trips,
                                      })
                                    : t('pages.analytics.frequencyCellTitleNone', {
                                        route: row.routeCode,
                                        hour: h,
                                      });
                                  return (
                                    <div
                                      key={`${row.routeId}-${h}`}
                                      className="freq-heatmap-cell"
                                      style={{ background: cell ? getHeadwayColor(headway) : 'transparent' }}
                                      title={title}
                                    >
                                      {cell && headway != null ? Math.round(headway) : ''}
                                    </div>
                                  );
                                })}
                              </Fragment>
                            ))}
                          </div>
                        </div>
                        {/* Legenda */}
                        <div className="freq-legend">
                          <span className="freq-legend-label">{t('pages.analytics.frequencyLegendMore')}</span>
                          <span className="freq-legend-swatch" style={{ background: getHeadwayColor(HEADWAY_MIN) }} />
                          <span className="freq-legend-swatch" style={{ background: getHeadwayColor((HEADWAY_MIN + HEADWAY_MAX) / 2) }} />
                          <span className="freq-legend-swatch" style={{ background: getHeadwayColor(HEADWAY_MAX) }} />
                          <span className="freq-legend-label">{t('pages.analytics.frequencyLegendLess')}</span>
                          <span className="freq-legend-swatch" style={{ background: 'var(--color-border)' }} />
                          <span className="freq-legend-label">{t('pages.analytics.frequencyLegendNone')}</span>
                          <span className="freq-legend-unit">({t('pages.analytics.frequencyUnitMin')})</span>
                        </div>
                      </>
                    )}
                  </section>

                  {/* Tempo de espera por paragem */}
                  <section className="bus-card analytics-card">
                    <h3>{t('pages.analytics.waitTitle')}</h3>
                    <p className="analytics-subtitle">{t('pages.analytics.waitDesc')}</p>
                    {waitStops.length === 0 ? (
                      <p className="analytics-empty">{t('pages.analytics.noCoverageData')}</p>
                    ) : (
                      <div className="wait-lists">
                        <div className="wait-list">
                          <h4 className="wait-list-title">{t('pages.analytics.waitWorst')}</h4>
                          {worstStops.map((s) => (
                            <div key={`w-${s.stopId}`} className="wait-row">
                              <span className="wait-row-name" title={s.stopName}>{s.stopName}</span>
                              <div className="wait-row-barwrap">
                                <div
                                  className="wait-row-bar"
                                  style={{
                                    width: `${maxWait > 0 ? Math.min((s.avgWaitMinutes / maxWait) * 100, 100) : 0}%`,
                                    background: getOccupancyColor((s.avgWaitMinutes / (maxWait || 1)) * 100),
                                  }}
                                />
                              </div>
                              <span className="wait-row-value">
                                {fmt1(s.avgWaitMinutes)} {t('pages.analytics.frequencyUnitMin')}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="wait-list">
                          <h4 className="wait-list-title">{t('pages.analytics.waitBest')}</h4>
                          {bestStops.map((s) => (
                            <div key={`b-${s.stopId}`} className="wait-row">
                              <span className="wait-row-name" title={s.stopName}>{s.stopName}</span>
                              <div className="wait-row-barwrap">
                                <div
                                  className="wait-row-bar"
                                  style={{
                                    width: `${maxWait > 0 ? Math.min((s.avgWaitMinutes / maxWait) * 100, 100) : 0}%`,
                                    background: '#10b981',
                                  }}
                                />
                              </div>
                              <span className="wait-row-value">
                                {fmt1(s.avgWaitMinutes)} {t('pages.analytics.frequencyUnitMin')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
