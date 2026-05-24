import { useState, useEffect, useCallback, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import api from '../services/api';
import { getMensagens, enviarMensagem } from '../services/despachoApi';
import './BusDetailPanel.css';

/**
 * Painel lateral semi-fullscreen com detalhes do autocarro + chat com motorista.
 * Aberto ao clicar num BusCard.
 */
export default function BusDetailPanel({ bus, driver, telemetry, isAdmin, onClose, onAction }) {
  const [tab, setTab] = useState('info'); // info | chat
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const chatEndRef = useRef(null);

  // Animação de fechar: aplica classe --closing, espera o transition acabar, depois chama onClose real
  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose(), 220);
  }, [closing, onClose]);

  // ─── Chat ───
  const fetchMessages = useCallback(async () => {
    try {
      const res = await getMensagens(bus.busCode);
      const sorted = (res.data || [])
        .slice(0, 50)
        .sort((a, b) => new Date(a.timestampEnvio) - new Date(b.timestampEnvio));
      setMessages(sorted);
    } catch (err) {
      console.warn('Falha a obter mensagens', err);
    }
  }, [bus.busCode]);

  // Marcar como lidas quando abre o painel + carregar mensagens + subscrever WS para refresh instantâneo
  useEffect(() => {
    fetchMessages();
    api.post(`/despacho/${bus.busCode}/mensagens/marcar-lidas`).catch(() => {});

    // WebSocket: refresh quando o backend emite atualização do tópico despacho do bus
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-telemetry`;
    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/despacho/${bus.busCode}`, () => fetchMessages());
      },
    });
    client.activate();
    return () => client.deactivate();
  }, [bus.busCode, fetchMessages]);

  useEffect(() => {
    if (tab === 'chat') {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [tab, messages.length]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || sending) return;
    setSending(true);
    try {
      await enviarMensagem(bus.busCode, chatInput.trim());
      setChatInput('');
      await fetchMessages();
    } catch (err) {
      alert('Erro: ' + (err.response?.data?.message || err.message));
    } finally {
      setSending(false);
    }
  };

  // Mensagem vinda do motorista vs do operador
  const isFromDriver = (msg) => msg.operador?.startsWith('motorista:');

  const statusLabels = {
    ACTIVE: 'Em serviço', STOPPING: 'A parar', STOPPED: 'Parado',
  };
  const statusColors = {
    ACTIVE: '#10b981', STOPPING: '#f59e0b', STOPPED: '#94a3b8',
  };

  const t = telemetry || {};

  return (
    <>
      <div className={`bdp-backdrop ${closing ? 'bdp-backdrop--closing' : ''}`} onClick={requestClose} />
      <aside className={`bdp-panel ${closing ? 'bdp-panel--closing' : ''}`} role="dialog" aria-modal="true">
        {/* Header */}
        <header className="bdp-header">
          <div>
            <div className="bdp-header-code">{bus.busCode}</div>
            <div className="bdp-header-route">
              {bus.routeCode ? `${bus.routeCode} — ${bus.routeName || ''}` : 'Sem rota'}
            </div>
          </div>
          <div className="bdp-header-right">
            <span className="bdp-status-badge" style={{ background: statusColors[bus.status] || '#94a3b8' }}>
              {statusLabels[bus.status] || bus.status}
            </span>
            <button className="bdp-close" onClick={requestClose} aria-label="Fechar">×</button>
          </div>
        </header>

        {/* Tabs */}
        <nav className="bdp-tabs">
          <button
            className={`bdp-tab ${tab === 'info' ? 'bdp-tab--active' : ''}`}
            onClick={() => setTab('info')}
          >
            Detalhes
          </button>
          <button
            className={`bdp-tab ${tab === 'chat' ? 'bdp-tab--active' : ''}`}
            onClick={() => setTab('chat')}
          >
            Chat
            {messages.filter(m => isFromDriver(m) && !m.lidaPeloOperador).length > 0 && (
              <span className="bdp-tab-dot"></span>
            )}
          </button>
        </nav>

        {/* Content */}
        <div className="bdp-content">
          {tab === 'info' && (
            <div className="bdp-info">
              {/* Motorista */}
              <section className="bdp-section">
                <h4 className="bdp-section-title">Motorista</h4>
                {driver ? (
                  <div className="bdp-driver-card">
                    <div className="bdp-driver-name">{driver.name}</div>
                    <div className="bdp-driver-meta">
                      <span>{driver.mechanographicNumber}</span>
                      {driver.phoneNumber && <span>{driver.phoneNumber}</span>}
                      <span className={`bdp-driver-status bdp-driver-status--${driver.status?.toLowerCase()}`}>
                        {driver.status === 'ON_DUTY' ? 'Em serviço' : 'Disponível'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bdp-driver-missing">
                    ⚠ Sem motorista atribuído. Atribuir em <a href="/backoffice/drivers">Motoristas →</a>
                  </div>
                )}
              </section>

              {/* Telemetria */}
              {bus.status !== 'STOPPED' && (
                <section className="bdp-section">
                  <h4 className="bdp-section-title">Telemetria em tempo real</h4>
                  <div className="bdp-telemetry">
                    <div className="bdp-telem-item">
                      <span className="bdp-telem-value">{t.speed?.toFixed(0) ?? '—'}</span>
                      <span className="bdp-telem-label">km/h</span>
                    </div>
                    <div className="bdp-telem-item">
                      <span className="bdp-telem-value">
                        {t.passengers ?? '—'}<span className="bdp-telem-unit">/{bus.capacity || '?'}</span>
                      </span>
                      <span className="bdp-telem-label">Passageiros</span>
                    </div>
                    <div className="bdp-telem-item bdp-telem-item--wide">
                      <span className="bdp-telem-value bdp-telem-value--small">{t.nextStop ?? '—'}</span>
                      <span className="bdp-telem-label">Próxima paragem</span>
                    </div>
                  </div>
                </section>
              )}

              {/* Info técnica */}
              <section className="bdp-section">
                <h4 className="bdp-section-title">Informação</h4>
                <dl className="bdp-info-grid">
                  <div><dt>Matrícula</dt><dd>{bus.licensePlate || '—'}</dd></div>
                  <div><dt>Capacidade</dt><dd>{bus.capacity || '—'} lugares</dd></div>
                  <div><dt>Rota</dt><dd>{bus.routeName || 'Sem rota'}</dd></div>
                </dl>
              </section>

              {/* Ações */}
              <section className="bdp-section bdp-actions">
                {bus.status === 'ACTIVE' && bus.routeId && (
                  <button className="btn btn-warning" onClick={() => onAction('stop', bus)}>
                    ■ Parar Autocarro
                  </button>
                )}
                {bus.status === 'STOPPING' && (
                  <button className="btn btn-secondary" onClick={() => onAction('activate', bus)}>
                    Cancelar Paragem
                  </button>
                )}
                {bus.status === 'STOPPED' && (
                  <button
                    className="btn btn-success"
                    onClick={() => onAction('activate', bus)}
                    disabled={!driver}
                    title={!driver ? 'É preciso atribuir motorista antes de ativar' : ''}
                  >
                    ▶ Ativar Autocarro
                  </button>
                )}
                {isAdmin && (!bus.routeId || bus.status === 'STOPPED') && (
                  <>
                    <button className="btn btn-secondary" onClick={() => onAction('edit', bus)}>
                      Editar
                    </button>
                    <button className="btn btn-danger" onClick={() => onAction('decommission', bus)}>
                      Descomissionar
                    </button>
                  </>
                )}
              </section>
            </div>
          )}

          {tab === 'chat' && (
            <div className="bdp-chat">
              <div className="bdp-chat-list">
                {messages.length === 0 ? (
                  <div className="bdp-chat-empty">Sem mensagens. Escreve a primeira ao motorista.</div>
                ) : (
                  messages.map(msg => {
                    const fromDriver = isFromDriver(msg);
                    return (
                      <div
                        key={msg.id}
                        className={`bdp-msg ${fromDriver ? 'bdp-msg--driver' : 'bdp-msg--operator'}`}
                      >
                        <div className="bdp-msg-content">{msg.conteudo}</div>
                        <div className="bdp-msg-meta">
                          <span>{new Date(msg.timestampEnvio).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                          {!fromDriver && (
                            <span className={`bdp-msg-state bdp-msg-state--${msg.estado?.toLowerCase()}`}>
                              {msg.estado === 'LIDA' && '✓✓ Lida'}
                              {msg.estado === 'ENTREGUE' && '✓✓ Entregue'}
                              {msg.estado === 'ENVIADA' && '✓ Enviada'}
                              {msg.estado === 'FALHOU' && '! Falhou'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              <form className="bdp-chat-form" onSubmit={handleSend}>
                <input
                  type="text"
                  placeholder={driver ? `Mensagem para ${driver.name.split(' ')[0]}...` : 'Mensagem...'}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  maxLength={140}
                  disabled={sending}
                />
                <button type="submit" disabled={sending || !chatInput.trim()}>
                  {sending ? '...' : 'Enviar'}
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
