import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import api from '../services/api';
import { getMensagens } from '../services/despachoApi';
import './PainelBordo.css';

export default function PainelBordo() {
  const { busCode } = useParams();
  const [bus, setBus] = useState(null);
  const [route, setRoute] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(new Date());
  const stompRef = useRef(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch bus + route
  const fetchData = useCallback(async () => {
    try {
      const { data: busData } = await api.get(`/buses/code/${busCode}`);
      setBus(busData);
      if (busData.routeId) {
        const { data: routeData } = await api.get(`/routes/${busData.routeId}`);
        setRoute(routeData);
      }
    } catch (err) {
      setError('Autocarro não encontrado: ' + busCode);
    }
  }, [busCode]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await getMensagens(busCode);
      setMessages((res.data || []).slice(0, 10));
    } catch { /* ignore */ }
  }, [busCode]);

  useEffect(() => {
    fetchData();
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [fetchData, fetchMessages]);

  // WebSocket telemetry
  useEffect(() => {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-telemetry`;
    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe('/topic/telemetry', (message) => {
          try {
            const t = JSON.parse(message.body);
            if (t.busId === busCode) setTelemetry(t);
          } catch { /* ignore */ }
        });
        // Subscribe to dispatch messages for this bus
        client.subscribe(`/topic/despacho/${busCode}`, () => {
          fetchMessages();
        });
      },
    });
    client.activate();
    stompRef.current = client;
    return () => client.deactivate();
  }, [busCode, fetchMessages]);

  // Current time string
  const timeStr = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

  // Find next stops based on schedule
  const getNextDepartures = () => {
    if (!route?.stops) return [];
    const nowTime = now.toTimeString().slice(0, 5); // HH:MM
    return route.stops.map(s => ({ ...s, nowTime }));
  };

  if (error) {
    return (
      <div className="pb-container">
        <div className="pb-error">
          <div className="pb-error-icon">!</div>
          <h2>{error}</h2>
          <p>Verifique o código do autocarro no URL.</p>
        </div>
      </div>
    );
  }

  if (!bus) {
    return (
      <div className="pb-container">
        <div className="pb-loading">A carregar painel de bordo...</div>
      </div>
    );
  }

  const speed = telemetry?.speed?.toFixed(0) ?? '—';
  const passengers = telemetry?.passengerCount ?? '—';
  const status = telemetry?.status ?? bus.status ?? 'STOPPED';
  const nextStop = telemetry?.nextStop ?? '—';
  const stops = route?.stops || [];

  const statusLabels = {
    'active': 'Em serviço',
    'at-stop': 'Na paragem',
    'stopping': 'A parar',
    'delayed': 'Atrasado',
    'stopped': 'Parado',
    'STOPPED': 'Parado',
    'ACTIVE': 'Em serviço',
  };

  const statusColors = {
    'active': '#10b981',
    'at-stop': '#6366f1',
    'stopping': '#f59e0b',
    'delayed': '#ef4444',
    'stopped': '#94a3b8',
    'STOPPED': '#94a3b8',
    'ACTIVE': '#10b981',
  };

  return (
    <div className="pb-container">
      {/* Header */}
      <header className="pb-header">
        <div className="pb-header-left">
          <div className="pb-bus-code">{busCode}</div>
          <div className="pb-route-name">
            {route ? `${route.code} — ${route.name}` : 'Sem rota atribuída'}
          </div>
        </div>
        <div className="pb-header-center">
          <div className="pb-clock">{timeStr}</div>
          <div className="pb-date">{dateStr}</div>
        </div>
        <div className="pb-header-right">
          <span className="pb-status-badge" style={{ background: statusColors[status] || '#94a3b8' }}>
            {statusLabels[status] || status}
          </span>
        </div>
      </header>

      {/* Main content */}
      <div className="pb-main">
        {/* Left: Route progress */}
        <section className="pb-section pb-route-section">
          <h3 className="pb-section-title">Percurso</h3>
          <div className="pb-route-list">
            {stops.length === 0 ? (
              <div className="pb-empty">Sem paragens definidas</div>
            ) : (
              stops.map((stop, i) => {
                const isCurrent = stop.stopName === nextStop || stop.stopCode === nextStop;
                const isPast = false; // could be computed from telemetry
                return (
                  <div key={stop.stopId || i} className={`pb-stop ${isCurrent ? 'pb-stop--current' : ''} ${isPast ? 'pb-stop--past' : ''}`}>
                    <div className="pb-stop-dot" />
                    <div className="pb-stop-info">
                      <span className="pb-stop-name">{stop.stopName}</span>
                      <span className="pb-stop-code">{stop.stopCode}</span>
                    </div>
                    <span className="pb-stop-order">#{stop.stopOrder}</span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right column */}
        <div className="pb-right-col">
          {/* Stats */}
          <section className="pb-section pb-stats">
            <div className="pb-stat">
              <span className="pb-stat-value">{speed}</span>
              <span className="pb-stat-label">km/h</span>
            </div>
            <div className="pb-stat">
              <span className="pb-stat-value">{passengers}</span>
              <span className="pb-stat-label">Passageiros</span>
            </div>
            <div className="pb-stat pb-stat--next">
              <span className="pb-stat-label">Prox. Paragem</span>
              <span className="pb-stat-value pb-stat-value--small">{nextStop}</span>
            </div>
          </section>

          {/* Messages */}
          <section className="pb-section pb-messages">
            <h3 className="pb-section-title">Mensagens do Despacho</h3>
            {messages.length === 0 ? (
              <div className="pb-empty">Sem mensagens</div>
            ) : (
              <div className="pb-message-list">
                {messages.map(msg => (
                  <div key={msg.id} className={`pb-message pb-message--${msg.estado?.toLowerCase()}`}>
                    <div className="pb-message-content">{msg.conteudo}</div>
                    <div className="pb-message-meta">
                      <span>{new Date(msg.timestampEnvio).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="pb-message-state">
                        {msg.estado === 'ENTREGUE' && 'Entregue'}
                        {msg.estado === 'LIDA' && 'Lida'}
                        {msg.estado === 'ENVIADA' && 'A enviar...'}
                        {msg.estado === 'FALHOU' && 'Falhou'}
                        {msg.estado === 'CANCELADA' && 'Cancelada'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
