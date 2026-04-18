import { useEffect, useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import api from '../services/api';
import HeatmapAnalytics from '../components/HeatmapAnalytics';
import './Buses.css'; // Mimetizar os estilos do Bus Dashboard

const COLORS = ['#22c55e', '#eab308', '#ef4444', '#3b82f6'];

export default function AnalyticsDashboard() {
  const [fleetData, setFleetData] = useState([]);
  const [delayData, setDelayData] = useState([]);
  const [efficiencyData, setEfficiencyData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fleetRes, delaysRes, efficiencyRes] = await Promise.all([
          api.get('/analytics/fleet-occupancy'),
          api.get('/analytics/route-delays'),
          api.get('/analytics/bus-efficiency')
        ]);
        setFleetData(fleetRes.data || []);
        setDelayData(delaysRes.data || []);
        setEfficiencyData(efficiencyRes.data || []);
      } catch(err) {
        console.error("Error fetching analytics", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // Atualização a cada 60s
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Gestão e Analytics</h1>
          <p className="page-subtitle">Ferramentas de decisão baseadas em histórico</p>
        </div>
      </div>

      {loading ? (
        <p style={{ padding: '0 2rem', color: '#6b7280' }}>A carregar gráficos pesados...</p>
      ) : (
        <div style={{ padding: '0 2rem', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          
          {/* Gráfico 1: Evolução da Frota (Linhas) */}
          <div className="bus-card" style={{ padding: '1.5rem', width: '100%', maxWidth: '1200px' }}>
            <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>Evolução de Tráfego e Autocarros (Última Hora)</h3>
            <div style={{ width: '100%', height: 350 }}>
              <ResponsiveContainer>
                <LineChart data={fleetData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="minute" stroke="#9ca3af" />
                  <YAxis yAxisId="left" stroke="#3b82f6" />
                  <YAxis yAxisId="right" orientation="right" stroke="#22c55e" />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} 
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="totalPassengers" name="Passageiros Totais" stroke="#3b82f6" activeDot={{ r: 8 }} strokeWidth={3} />
                  <Line yAxisId="right" type="monotone" dataKey="activeBuses" name="Autocarros Ativos" stroke="#22c55e" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {fleetData.length === 0 && <p style={{color: '#9ca3af'}}>Sem dados históricos de frota disponíveis.</p>}
          </div>

          {/* Gráfico 2: Atrasos de Rota (Barras) */}
          <div className="bus-card" style={{ padding: '1.5rem', width: '100%', maxWidth: '1200px', marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>Impacto Operacional (Logs por Rota)</h3>
            <div style={{ width: '100%', height: 350 }}>
              <ResponsiveContainer>
                <BarChart data={delayData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="routeCode" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <RechartsTooltip 
                    cursor={{fill: '#f3f4f6'}}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} 
                  />
                  <Legend />
                  <Bar dataKey="statusCount" name="Eventos Registados" fill="#eab308" radius={[4, 4, 0, 0]}>
                    {
                      delayData.map((entry, index) => {
                        let barColor = '#eab308'; // default
                        if (entry.status === 'active') barColor = '#22c55e';
                        else if (entry.status === 'delayed') barColor = '#ef4444';
                        else if (entry.status === 'stopped') barColor = '#9ca3af';
                        return <Cell key={`cell-${index}`} fill={barColor} />;
                      })
                    }
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
             {delayData.length === 0 && <p style={{color: '#9ca3af'}}>Nenhum evento anómalo registado nas rotas.</p>}
          </div>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            {/* Gráfico 3: Mapa de Calor (Esquerda) */}
            <div className="bus-card" style={{ padding: '1.5rem', flex: '1 1 400px', minWidth: '400px' }}>
              <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>Zonas Quentes (Densidade de Passageiros)</h3>
              <HeatmapAnalytics />
            </div>

            {/* Gráfico 4: Eficiência de Autocarros (Direita) */}
            <div className="bus-card" style={{ padding: '1.5rem', flex: '1 1 400px', minWidth: '400px' }}>
              <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>Eficiência da Frota (Lotação Média vs Máxima)</h3>
              <div style={{ width: '100%', height: 400 }}>
                <ResponsiveContainer>
                  <BarChart data={efficiencyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                    <XAxis type="number" stroke="#9ca3af" />
                    <YAxis dataKey="busId" type="category" stroke="#9ca3af" width={80} />
                    <RechartsTooltip 
                      cursor={{fill: '#f3f4f6'}}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} 
                    />
                    <Legend />
                    <Bar dataKey="avgPassengers" name="Passageiros Médios" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="maxPassengers" name="Lotação Máxima Registo" fill="#9ca3af" radius={[0, 4, 4, 0]} opacity={0.5} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {efficiencyData.length === 0 && <p style={{color: '#9ca3af'}}>Sem dados de eficiência calculados ainda.</p>}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
