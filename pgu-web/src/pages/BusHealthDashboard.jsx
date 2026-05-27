import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { createStompClient } from '../services/stompClient';
import './Buses.css';

/**
 * Deriva o estado de saúde (chave canónica) a partir do uptime.
 * O label visível é traduzido via i18next ao renderizar.
 */
const deriveHealthStatus = (pct) => {
  if (pct == null || Number.isNaN(pct)) return 'NO_DATA';
  if (pct >= 95) return 'GOOD';
  if (pct >= 80) return 'DEGRADED';
  if (pct >  0) return 'WEAK';
  return 'OFFLINE';
};

export default function BusHealthDashboard() {
  const { t } = useTranslation();
  const [healthData, setHealthData] = useState([]);
  const [loading, setLoading] = useState(true);

  const statusLabel = (key) => {
    switch (key) {
      case 'GOOD': return t('pages.health.statusGood');
      case 'DEGRADED': return t('pages.health.statusDegraded');
      case 'WEAK': return t('pages.health.statusWeak');
      case 'OFFLINE': return t('pages.health.statusOffline');
      default: return t('pages.health.statusNoData');
    }
  };

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

    // 2. Real-time connection STOMP — Sprint -1 (SEC-4) autenticado via JWT
    const stompClient = createStompClient({
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
                    healthStatus: 'NO_DATA',
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
      case 'GOOD':
        return { backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' };
      case 'DEGRADED':
        return { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };
      case 'WEAK':
        return { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' };
      case 'OFFLINE':
        return { backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' };
      default: // NO_DATA
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
          <h1>{t('pages.health.iotTitle')}</h1>
          <p className="page-subtitle">{t('pages.health.iotSubtitle')}</p>
        </div>
      </div>

      {loading && <p style={{ padding: '0 2rem', color: '#6b7280' }}>{t('pages.health.loading')}</p>}

      {!loading && healthData.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">&#128653;</div>
          <div className="empty-state-text">{t('pages.health.noHealth')}</div>
        </div>
      )}

      <div className="bus-grid">
        {healthData.map((bus) => {
          const badgeStyle = getBadgeStyle(bus.healthStatus);
          const barColor = getProgressBarColor(bus.uptimePercentage);
          const formattedLastSync = bus.lastSync
            ? `${t('pages.health.lastCommPrefix')}: ${new Date(bus.lastSync).toLocaleTimeString('pt-PT')}`
            : t('pages.health.statusNoData');

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
                  {statusLabel(bus.healthStatus)}
                </div>
              </div>

              <div className="bus-card-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: '500' }}>
                  {formattedLastSync}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                    <span>{t('pages.health.uptimeDaily')}</span>
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
