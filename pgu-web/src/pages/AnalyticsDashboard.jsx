import { useEffect, useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import api from '../services/api';
import HeatmapAnalytics from '../components/HeatmapAnalytics';
import './Buses.css';            // herdar estilo de cards
import './AnalyticsDashboard.css';

// Paleta consistente com os tokens do backoffice (index.css)
const CHART = {
  passengers:  '#4f46e5', // primary-hover
  buses:       '#10b981', // success
  active:      '#10b981',
  atStop:      '#6366f1', // primary
  stopping:    '#f59e0b', // warning
  delayed:     '#ef4444', // danger
  stopped:     '#94a3b8', // neutro
  avgPax:      '#6366f1',
  maxPax:      '#cbd5e1',
  axis:        '#94a3b8',
  grid:        '#f1f5f9',
};

// Evita recriar objectos inline a cada render (regra reduce-reflows)
const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
  fontSize: 13,
};

// Formata números para UI (média vs contagem inteira)
const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : v);

// Tooltip de estados: mostra apenas a proporção (%) de cada estado.
// A contagem absoluta depende da taxa de amostragem e confunde mais do que informa.
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

export default function AnalyticsDashboard() {
  const [fleetData, setFleetData]             = useState([]);
  const [delayData, setDelayData]             = useState([]);
  const [efficiencyData, setEfficiencyData]   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const abortRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      // cancela pedidos anteriores se ainda pendentes (evita sobreposições)
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const [fleet, delays, eff] = await Promise.all([
          api.get('/analytics/fleet-occupancy', { signal: ctrl.signal }),
          api.get('/analytics/route-delays',    { signal: ctrl.signal }),
          api.get('/analytics/bus-efficiency',  { signal: ctrl.signal }),
        ]);
        setFleetData(fleet.data || []);
        // Semântica do DW:
        //   telemetry.status = 'stopped' | 'at-stop'  → "Em paragem" (veículo estacionário numa paragem)
        //   telemetry.status = 'active'               → "Ativo"
        //   telemetry.status = 'delayed'              → "Atrasado"
        //   telemetry.status = 'stopping'             → NÃO É MOSTRADO
        //       ("A parar" só faz sentido quando alguém preme o botão de parar,
        //        informação que vive em `buses.status`, não em telemetria pura.)
        //   buses.status     = 'STOPPED'              → "Parado" (fora de serviço,
        //                                               estado do autocarro — fora
        //                                               deste gráfico de telemetria)
        const normalized = (delays.data || []).map(d => ({
          ...d,
          atStopCount: (d.atStopCount || 0) + (d.stoppedCount || 0),
          stoppedCount: 0,
          stoppingCount: 0, // excluído do stacked bar
        }));
        setDelayData(normalized);
        setEfficiencyData(eff.data || []);
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
      </div>

      {loading ? (
        <p className="analytics-loading">A carregar gráficos…</p>
      ) : (
        <div className="analytics-grid">

          {/* 1 — Evolução da Frota */}
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

          {/* 2 — Estados por Rota (stacked 100% = proporção de tempo) */}
          <section className="bus-card analytics-card">
            <h3>Distribuição de Estados por Rota (Hoje)</h3>
            <p className="analytics-subtitle">
              Proporção do tempo em cada estado operacional. Ideal perto de 100% <span style={{color: CHART.active, fontWeight:600}}>Ativo</span>.
            </p>
            <div className="chart-container chart-container--lg">
              <ResponsiveContainer>
                <BarChart
                  data={delayData}
                  margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                  stackOffset="expand"
                  barCategoryGap="25%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                  <XAxis dataKey="routeCode" stroke={CHART.axis} tick={{ fontSize: 12 }} />
                  <YAxis
                    stroke={CHART.axis}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                    domain={[0, 1]}
                  />
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

          {/* 3 + 4 lado a lado */}
          <div className="analytics-row">
            <section className="bus-card analytics-card">
              <h3>Zonas Quentes (Densidade de Passageiros)</h3>
              <HeatmapAnalytics />
            </section>

            <section className="bus-card analytics-card">
              <h3>Eficiência da Frota (Média vs Máx de Passageiros)</h3>
              <div className="chart-container chart-container--xl">
                <ResponsiveContainer>
                  <BarChart data={efficiencyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                    <XAxis type="number" stroke={CHART.axis} tick={{ fontSize: 12 }} />
                    <YAxis dataKey="busId" type="category" stroke={CHART.axis} width={80} tick={{ fontSize: 12 }} />
                    <RechartsTooltip
                      cursor={{ fill: CHART.grid }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value, name) => [name === 'Média' ? fmt1(value) : value, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="avgPassengers" name="Média"  fill={CHART.avgPax} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="maxPassengers" name="Máximo" fill={CHART.maxPax} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {efficiencyData.length === 0 && <p className="analytics-empty">Sem dados de eficiência.</p>}
            </section>
          </div>

        </div>
      )}
    </div>
  );
}
