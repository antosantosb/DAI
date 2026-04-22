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
  const abortRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const [fleet, delays, eff, speed, cong] = await Promise.all([
          api.get('/analytics/fleet-occupancy', { signal: ctrl.signal }),
          api.get('/analytics/route-delays',    { signal: ctrl.signal }),
          api.get('/analytics/bus-efficiency',  { signal: ctrl.signal }),
          api.get('/analytics/speed-over-time', { signal: ctrl.signal }),
          api.get('/analytics/congestion',      { signal: ctrl.signal }),
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

    fetchData();
    const iv = setInterval(fetchData, 60_000);
    return () => {
      clearInterval(iv);
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="analytics-page">
      <div className="page-header">
        <div>
          <h1>Gestão e Analytics</h1>
          <p className="page-subtitle">Ferramentas de decisão baseadas em histórico</p>
        </div>
        <a
          href={`${window.location.protocol}//${window.location.hostname}:3000`}
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
            <div className="analytics-grid">
              <section className="bus-card analytics-card">
                <h3>Evolução de Tráfego e Autocarros (Última Hora)</h3>
                <div className="chart-container chart-container--lg">
                  <ResponsiveContainer>
                    <LineChart data={fleetData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                      <XAxis dataKey="minute" stroke={CHART.axis} tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left"  stroke={CHART.passengers} tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" stroke={CHART.buses} tick={{ fontSize: 12 }} />
                      <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Line yAxisId="left"  type="monotone" dataKey="totalPassengers" name="Passageiros Totais" stroke={CHART.passengers} strokeWidth={2.5} activeDot={{ r: 6 }} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="activeBuses"     name="Autocarros Ativos"   stroke={CHART.buses}      strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {fleetData.length === 0 && <p className="analytics-empty">Sem dados de frota nas últimas 2 horas.</p>}
              </section>

              <section className="bus-card analytics-card">
                <h3>Distribuição de Estados por Rota (Hoje)</h3>
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
                {delayData.length === 0 && <p className="analytics-empty">Sem eventos operacionais registados hoje.</p>}
              </section>
            </div>
          )}

          {/* ═══ TAB AUTOCARROS ═══ */}
          {activeTab === 'buses' && (
            <div className="analytics-grid">
              <section className="bus-card analytics-card">
                <h3>Eficiência da Frota (Média vs Máx de Passageiros)</h3>
                <div className="chart-container chart-container--xl">
                  <ResponsiveContainer>
                    <BarChart data={efficiencyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                      <XAxis type="number" stroke={CHART.axis} tick={{ fontSize: 12 }} />
                      <YAxis dataKey="busId" type="category" stroke={CHART.axis} width={80} tick={{ fontSize: 12 }} />
                      <RechartsTooltip cursor={{ fill: CHART.grid }} contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [name === 'Média' ? fmt1(value) : value, name]} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar dataKey="avgPassengers" name="Média"  fill={CHART.avgPax} radius={[0, 4, 4, 0]} />
                      <Bar dataKey="maxPassengers" name="Máximo" fill={CHART.maxPax} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {efficiencyData.length === 0 && <p className="analytics-empty">Sem dados de eficiência.</p>}
              </section>

              <section className="bus-card analytics-card">
                <h3>Velocidade Média da Frota (Última Hora)</h3>
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
                {speedData.length === 0 && <p className="analytics-empty">Sem dados de velocidade na última hora.</p>}
              </section>
            </div>
          )}

          {/* ═══ TAB GEOGRÁFICO ═══ */}
          {activeTab === 'geo' && (
            <div className="analytics-grid">
              <section className="bus-card analytics-card">
                <h3>Zonas Quentes (Densidade de Passageiros)</h3>
                <HeatmapAnalytics />
              </section>

              <section className="bus-card analytics-card">
                <h3>Pontos de Congestionamento (Últimas 2h)</h3>
                <p className="analytics-subtitle">
                  Autocarros com velocidade &lt;15 km/h e mais de 10 passageiros — possível trânsito ou paragem prolongada.
                </p>
                {congestionData.length === 0 ? (
                  <p className="analytics-empty">Nenhum ponto de congestionamento detetado.</p>
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
                        <span className="congestion-stat-value">{Math.max(...congestionData.map(c => c.passengerCount))}</span>
                        <span className="congestion-stat-label">Máx. Passageiros</span>
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
