import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { getMensagens, enviarMensagem } from '../services/despachoApi';
import { createStompClient } from '../services/stompClient';
import './BusDetailPanel.css';

/**
 * Painel lateral semi-fullscreen com detalhes do autocarro + chat com motorista.
 * Aberto ao clicar num BusCard.
 */
export default function BusDetailPanel({ bus, driver, telemetry, isAdmin, onClose, onAction }) {
  const { t } = useTranslation();
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

    // Sprint -1 (SEC-4): WS autenticado via JWT no CONNECT.
    const client = createStompClient({
      onConnect: () => {
        client.subscribe(`/topic/mensagens/${bus.busCode}`, () => fetchMessages());
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

  // Sprint 1 follow-up: renomeado de `t` para `tele` para nao colidir com
  // o `t` do useTranslation (i18n) introduzido neste componente.
  const tele = telemetry || {};

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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>
                      {t('pages.buses.driverMissing')}{' '}
                      <a href="/backoffice/drivers" className="inline-link">
                        {t('pages.buses.assignInDrivers')}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </a>
                    </span>
                  </div>
                )}
              </section>

              {/* Telemetria */}
              {bus.status !== 'STOPPED' && (
                <section className="bdp-section">
                  <h4 className="bdp-section-title">Telemetria em tempo real</h4>
                  <div className="bdp-telemetry">
                    <div className="bdp-telem-item">
                      <span className="bdp-telem-value">{tele.speed?.toFixed(0) ?? '—'}</span>
                      <span className="bdp-telem-label">km/h</span>
                    </div>
                    <div className="bdp-telem-item">
                      <span className="bdp-telem-value">
                        {tele.passengers ?? '—'}<span className="bdp-telem-unit">/{bus.capacity || '?'}</span>
                      </span>
                      <span className="bdp-telem-label">Passageiros</span>
                    </div>
                    <div className="bdp-telem-item bdp-telem-item--wide">
                      <span className="bdp-telem-value bdp-telem-value--small">{tele.nextStop ?? '—'}</span>
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
