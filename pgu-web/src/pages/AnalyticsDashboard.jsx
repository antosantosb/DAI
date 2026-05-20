import { useEffect, useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area,
} from 'recharts';
import api from '../services/api';
import HeatmapAnalytics from '../components/HeatmapAnalytics';
import './Buses.css';
import './AnalyticsDashboard.css';

const CHART = {
  passengers:  '#4f46e5',
  buses:       '#10b981',
  active:      '#10b981',
  atStop:      '#6366f1',
  stopping:    '#f59e0b',
  delayed:     '#ef4444',
  stopped:     '#94a3b8',
  avgPax:      '#6366f1',
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

const TABS = [
  { key: 'fleet', label: 'Frota' },
  { key: 'buses', label: 'Autocarros' },
  { key: 'geo', label: 'Geográfico' },
];

export default function AnalyticsDashboard() {
  const [fleetData, setFleetData]             = useState([]);
  const [delayData, setDelayData]             = useState([]);
  const [efficiencyData, setEfficiencyData]   = useState([]);
  const [speedData, setSpeedData]             = useState([]);
  const [congestionData, setCongestionData]   = useState([]);
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
      const [fleet, delays, eff, speed, cong] = await Promise.all([
        api.get('/analytics/fleet-occupancy', { params, signal: ctrl.signal }),
        api.get('/analytics/route-delays',    { params, signal: ctrl.signal }),
        api.get('/analytics/bus-efficiency',  { params, signal: ctrl.signal }),
        api.get('/analytics/speed-over-time', { params, signal: ctrl.signal }),
        api.get('/analytics/congestion',      { params, signal: ctrl.signal }),
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

  return (
    <div className="analytics-page">
      <div className="page-header">
        <div>
          <h1>Gestão e Analytics</h1>
          <p className="page-subtitle">Ferramentas de decisão baseadas em histórico</p>
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
          Metabase
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>

      {/* Dynamic Filter Card */}
      <form onSubmit={handleFilter} className="analytics-filter-card">
        <div className="filter-group">
          <label>Data de Início</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Data de Fim</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Hora de Início</label>
          <input
            type="time"
            value={startHour}
            onChange={(e) => setStartHour(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Hora de Fim</label>
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
            Filtrar
          </button>
          {(isFiltered || startDate || endDate || startHour || endHour) && (
            <button type="button" onClick={handleClear} className="btn-clear">
              Limpar
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
        <p className="analytics-loading">A carregar gráficos…</p>
      ) : (
        <>
          {/* ═══ TAB FROTA ═══ */}
          {activeTab === 'fleet' && (
            <>
              {/* KPIs Row */}
              <div className="analytics-kpi-row">
                <div className="analytics-kpi-card">
                  <span className="kpi-value">{avgFleetOccupancy ? `${avgFleetOccupancy}%` : '—'}</span>
                  <span className="kpi-label">Taxa Média de Ocupação</span>
                </div>
                <div className="analytics-kpi-card">
                  <span className="kpi-value">{peakPassengers}</span>
                  <span className="kpi-label">Pico de Passageiros</span>
                </div>
                <div className="analytics-kpi-card">
                  <span className="kpi-value">{avgActiveBuses}</span>
                  <span className="kpi-label">Autocarros Ativos Médios</span>
                </div>
              </div>

              <div className="analytics-grid">
                <section className="bus-card analytics-card">
                  <h3>Evolução de Tráfego e Ocupação da Frota</h3>
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
                            if (name === 'Ocupação da Frota (%)') return [`${fmt1(value)}%`, name];
                            return [value, name];
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 13 }} />
                        <Line yAxisId="left"  type="monotone" dataKey="totalPassengers" name="Passageiros Totais" stroke={CHART.passengers} strokeWidth={2.5} activeDot={{ r: 6 }} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="activeBuses"     name="Autocarros Ativos"   stroke={CHART.buses}      strokeWidth={2.5} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="occupancyRate"   name="Ocupação da Frota (%)" stroke="#f59e0b"        strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {fleetData.length === 0 && <p className="analytics-empty">Sem dados de frota no intervalo selecionado.</p>}
                </section>

                <section className="bus-card analytics-card">
                  <h3>Distribuição de Estados por Rota</h3>
                  <p className="analytics-subtitle">
                    Proporção do tempo em cada estado operacional. Ideal perto de 100% <span style={{color: CHART.active, fontWeight:600}}>Ativo</span>.
                  </p>
                  <div className="chart-container chart-container--lg">
                    <ResponsiveContainer>
                      <BarChart data={delayData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }} stackOffset="expand" barCategoryGap="25%">
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                        <XAxis dataKey="routeCode" stroke={CHART.axis} tick={{ fontSize: 12 }} />
                        <YAxis stroke={CHART.axis} tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
                        <RechartsTooltip cursor={{ fill: CHART.grid }} content={<DelaysTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 13 }} />
                        <Bar dataKey="activeCount"   stackId="s" name="Ativo"     fill={CHART.active} />
                        <Bar dataKey="atStopCount"   stackId="s" name="Em paragem" fill={CHART.atStop} />
                        <Bar dataKey="delayedCount"  stackId="s" name="Atrasado"   fill={CHART.delayed} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {delayData.length === 0 && <p className="analytics-empty">Sem eventos operacionais registados no intervalo selecionado.</p>}
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
                  <span className="kpi-label">Ocupação Média Geral</span>
                </div>
                <div className="analytics-kpi-card">
                  <span className="kpi-value">{overallMaxOccupancy ? `${overallMaxOccupancy}%` : '—'}</span>
                  <span className="kpi-label">Pico de Ocupação Geral</span>
                </div>
                <div className="analytics-kpi-card">
                  <span className="kpi-value">
                    {mostUtilizedBus ? `${mostUtilizedBus.busId} (${mostUtilizedBus.avgOccupancyRate.toFixed(1)}%)` : '—'}
                  </span>
                  <span className="kpi-label">Autocarro Mais Solicitado</span>
                </div>
              </div>

              <div className="analytics-grid">
                <section className="bus-card analytics-card">
                  <div className="card-header-actions">
                    <h3>Eficiência da Frota</h3>
                    <div className="metric-toggle">
                      <button
                        className={`btn-toggle ${efficiencyMetric === 'passengers' ? 'active' : ''}`}
                        onClick={() => setEfficiencyMetric('passengers')}
                      >
                        Passageiros
                      </button>
                      <button
                        className={`btn-toggle ${efficiencyMetric === 'occupancy' ? 'active' : ''}`}
                        onClick={() => setEfficiencyMetric('occupancy')}
                      >
                        Taxa de Ocupação (%)
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
                            <Bar dataKey="avgPassengers" name="Média (Pax)"  fill={CHART.avgPax} radius={[0, 4, 4, 0]} />
                            <Bar dataKey="maxPassengers" name="Máximo (Pax)" fill={CHART.maxPax} radius={[0, 4, 4, 0]} />
                          </>
                        ) : (
                          <>
                            <Bar dataKey="avgOccupancyRate" name="Ocupação Média (%)"  fill={CHART.avgPax} radius={[0, 4, 4, 0]} />
                            <Bar dataKey="maxOccupancyRate" name="Ocupação Máxima (%)" fill={CHART.maxPax} radius={[0, 4, 4, 0]} />
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {efficiencyData.length === 0 && <p className="analytics-empty">Sem dados de eficiência.</p>}
                </section>

                <section className="bus-card analytics-card">
                  <h3>Velocidade Média da Frota</h3>
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
                        <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${fmt1(v)} km/h`, 'Vel. Média']} />
                        <Area type="monotone" dataKey="avgSpeed" stroke={CHART.speed} strokeWidth={2.5} fill="url(#speedGrad)" dot={false} activeDot={{ r: 5 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {speedData.length === 0 && <p className="analytics-empty">Sem dados de velocidade no intervalo selecionado.</p>}
                </section>
              </div>
            </>
          )}

          {/* ═══ TAB GEOGRÁFICO ═══ */}
          {activeTab === 'geo' && (
            <div className="analytics-grid">
              <section className="bus-card analytics-card">
                <h3>Zonas Quentes (Densidade de Passageiros)</h3>
                <HeatmapAnalytics />
              </section>

              <section className="bus-card analytics-card">
                <h3>Pontos de Congestionamento</h3>
                <p className="analytics-subtitle">
                  Autocarros com velocidade &lt;15 km/h e mais de 10 passageiros — possível trânsito ou paragem prolongada.
                </p>
                {congestionData.length === 0 ? (
                  <p className="analytics-empty">Nenhum ponto de congestionamento detetado no intervalo selecionado.</p>
                ) : (
                  <>
                    <div className="congestion-summary">
                      <div className="congestion-stat">
                        <span className="congestion-stat-value">{congestionData.length}</span>
                        <span className="congestion-stat-label">Registos</span>
                      </div>
                      <div className="congestion-stat">
                        <span className="congestion-stat-value">{new Set(congestionData.map(c => c.busId)).size}</span>
                        <span className="congestion-stat-label">Autocarros</span>
                      </div>
                      <div className="congestion-stat">
                        <span className="congestion-stat-value">{new Set(congestionData.map(c => c.routeCode).filter(Boolean)).size}</span>
                        <span className="congestion-stat-label">Rotas Afetadas</span>
                      </div>
                      <div className="congestion-stat">
                        <span className="congestion-stat-value">
                          {Math.max(...congestionData.map(c => c.occupancyRate || 0)).toFixed(1)}<small>%</small>
                        </span>
                        <span className="congestion-stat-label">Máx. Ocupação</span>
                      </div>
                    </div>
                    <div className="congestion-table-wrap">
                      <table className="congestion-table">
                        <thead>
                          <tr>
                            <th>Autocarro</th>
                            <th>Rota</th>
                            <th>Velocidade</th>
                            <th>Passageiros</th>
                            <th>Ocupação (%)</th>
                            <th>Hora</th>
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
        </>
      )}
    </div>
  );
}
