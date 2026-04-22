import { useEffect, useState } from 'react';
import api from '../services/api';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import './Buses.css';

/**
 * Deriva o label/estado de saúde a partir do uptime.
 * Em vez de receber uma string fixa do backend (que estava
 * hard-coded a "Good Performance"), usamos thresholds baseados
 * na percentagem de amostras recebidas nas últimas N horas.
 */
const deriveHealthStatus = (pct) => {
  if (pct == null || Number.isNaN(pct)) return 'Sem Dados';
  if (pct >= 95) return 'Bom Desempenho';
  if (pct >= 80) return 'Desempenho Degradado';
  if (pct >  0) return 'Desempenho Fraco';
  return 'Offline';
};

export default function BusHealthDashboard() {
  const [healthData, setHealthData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initial Load via HTTP
    api.get('/telemetry/health')
      .then(r => {
        // Deriva sempre o estado a partir do uptime, ignorando qualquer
        // label que possa vir do backend.
        const data = (r.data || []).map(b => ({
          ...b,
          healthStatus: deriveHealthStatus(b.uptimePercentage),
        }));
        setHealthData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching initial health data:", err);
        setLoading(false);
      });

    // 2. Real-time connection with STOMP over SockJS
    const stompClient = new Client({
      webSocketFactory: () => new SockJS(`${window.location.origin}/ws-telemetry`),
      reconnectDelay: 5000, // tenta reconectar a cada 5 segundos
      onConnect: () => {
        console.log('Connected to STOMP via SockJS!');

        stompClient.subscribe('/topic/telemetry', (message) => {
          if (message.body) {
            const telemetryUpdate = JSON.parse(message.body);

            // Functional State Update para injetar as atualizações em tempo real
            setHealthData((prevData) => {
              const busIndex = prevData.findIndex(b => b.busId === telemetryUpdate.busId);
              const currentTime = new Date().toISOString();

              if (busIndex !== -1) {
                // Mantemos a percentagem de uptime que veio do snapshot inicial
                // (computada no backend por janela temporal) e re-derivamos o
                // label de estado a partir dela. O evento STOMP só confirma
                // que o bus continua a comunicar → só refresca o lastSync.
                const newArray = [...prevData];
                const cur = newArray[busIndex];
                newArray[busIndex] = {
                  ...cur,
                  lastSync: currentTime,
                  healthStatus: deriveHealthStatus(cur.uptimePercentage),
                };
                return newArray;
              } else {
                // Primeiro evento para um bus que não estava no snapshot HTTP:
                // até ao próximo poll da saúde ainda não sabemos o uptime real.
                // Entra como "Sem Dados" e o próximo refresh corrigirá.
                return [
                  ...prevData,
                  {
                    busId: telemetryUpdate.busId,
                    lastSync: currentTime,
                    uptimePercentage: null,
                    healthStatus: 'Sem Dados',
                  }
                ];
              }
            });
          }
        });
      },
      onStompError: (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
        console.error('Additional details: ' + frame.body);
      }
    });

    stompClient.activate();

    // 3. Cleanup do cliente WebSocket para evitar re-conexões ou vazamento de memória e handles
    return () => {
      stompClient.deactivate();
    };
  }, []);

  const getBadgeStyle = (status) => {
    switch (status) {
      case 'Bom Desempenho':
        return { backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' };
      case 'Desempenho Degradado':
        return { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };
      case 'Desempenho Fraco':
        return { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' };
      case 'Offline':
        return { backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' };
      default: // Sem Dados
        return { backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' };
    }
  };

  const getProgressBarColor = (percentage) => {
    if (percentage == null) return '#cbd5e1';
    if (percentage >= 95) return '#22c55e';
    if (percentage >= 80) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Saúde da Rede IoT</h1>
          <p className="page-subtitle">Monitorização em tempo real do estado de sincronização</p>
        </div>
      </div>

      {loading && <p style={{ padding: '0 2rem', color: '#6b7280' }}>A carregar dados de saúde...</p>}

      {!loading && healthData.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">&#128653;</div>
          <div className="empty-state-text">Nenhum dado de saúde disponível.</div>
        </div>
      )}

      <div className="bus-grid">
        {healthData.map((bus) => {
          const badgeStyle = getBadgeStyle(bus.healthStatus);
          const barColor = getProgressBarColor(bus.uptimePercentage);
          const formattedLastSync = bus.lastSync
            ? `Última comunicação: ${new Date(bus.lastSync).toLocaleTimeString('pt-PT')}`
            : 'Sem dados';

          return (
            <div key={bus.busId} className="bus-card">
              <div className="bus-card-header">
                <div className="bus-card-title">
                  <span className="bus-code">{bus.busId}</span>
                </div>
                <div style={{
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  ...badgeStyle
                }}>
                  {bus.healthStatus}
                </div>
              </div>

              <div className="bus-card-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '500' }}>
                  {formattedLastSync}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                    <span>Uptime Diário</span>
                    <span>{bus.uptimePercentage == null ? '—' : `${bus.uptimePercentage}%`}</span>
                  </div>
                  <div style={{ width: '100%', height: '10px', backgroundColor: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(Math.max(bus.uptimePercentage, 0), 100)}%`,
                      height: '100%',
                      backgroundColor: barColor,
                      transition: 'width 0.5s ease-in-out'
                    }}></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
