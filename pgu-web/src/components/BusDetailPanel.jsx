import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../services/api';
import { getMensagens, enviarMensagem } from '../services/despachoApi';
import { createStompClient } from '../services/stompClient';
import MessageStatusIcon from './MessageStatusIcon';
import './BusDetailPanel.css';

// Fase E (E-front-1): "hoje" em Europe/Lisbon (YYYY-MM-DD).
function todayLisbonISO()
{
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}
function formatPlannedTime(iso)
{
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Painel lateral semi-fullscreen com detalhes do autocarro + chat com motorista.
 * Aberto ao clicar num BusCard.
 */
// Estado do main sensor -> classe do badge (alinhado com a pagina Sensors).
// Tolerante a maiusculas/minusculas e a valores desconhecidos.
function sensorStatusKey(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'ATIVO') return 'ativo';
  if (s === 'INATIVO') return 'inativo';
  if (s === 'AVARIA') return 'avaria';
  return 'desconhecido';
}

export default function BusDetailPanel({ bus, driver, sensor, telemetry, isAdmin, onClose, onAction, scheduleRefreshKey }) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState('info'); // info | chat
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const chatEndRef = useRef(null);

  // Fase E (E-front-1): escala do dia (bus_duty) para este autocarro.
  const [duties, setDuties] = useState([]);
  const [loadingDuties, setLoadingDuties] = useState(false);
  const todayISO = todayLisbonISO();

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

  // Fase E (E-front-1): carrega escala de HOJE para este bus (best-effort).
  useEffect(() => {
    if (!bus?.id) return;
    setLoadingDuties(true);
    api.get(`/buses/${bus.id}/duties`, { params: { date: todayISO } })
      .then(r => setDuties(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDuties([]))
      .finally(() => setLoadingDuties(false));
  }, [bus?.id, todayISO, scheduleRefreshKey]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || sending) return;
    setSending(true);
    try {
      await enviarMensagem(bus.busCode, chatInput.trim());
      setChatInput('');
      await fetchMessages();
    } catch (err) {
      // Toast vermelho coerente com o resto do sistema (em vez de alert nativo).
      toast.error(err.response?.data?.message || err.message || 'Erro a enviar mensagem', {
        autoClose: 6000,
      });
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

  // Estado terminal: vista MINIMA so' com matricula + capacidade. Sem motorista,
  // sem sensor, sem escala, sem tabs, sem chat, sem acoes. O autocarro deixou
  // de operar; nao faz sentido expor controlos nem dados operacionais.
  if (bus.status === 'DECOMMISSIONED') {
    return (
      <>
        <div className={`bdp-backdrop ${closing ? 'bdp-backdrop--closing' : ''}`} onClick={requestClose} />
        <aside className={`bdp-panel ${closing ? 'bdp-panel--closing' : ''}`} role="dialog" aria-modal="true">
          <header className="bdp-header">
            <div>
              <div className="bdp-header-code">{bus.busCode}</div>
              <div className="bdp-header-route">{t('pages.buses.decommissionedBadge')}</div>
            </div>
            <div className="bdp-header-right">
              <span className="bdp-status-badge" style={{ background: '#ef4444' }}>
                {t('pages.buses.decommissionedBadge')}
              </span>
              <button className="bdp-close" onClick={requestClose} aria-label={t('common.close') || 'Fechar'}>×</button>
            </div>
          </header>
          <div className="bdp-content">
            <div className="bdp-info">
              <section className="bdp-section">
                <h4 className="bdp-section-title">Informação</h4>
                <dl className="bdp-info-grid">
                  <div><dt>Matrícula</dt><dd>{bus.licensePlate || '—'}</dd></div>
                  <div><dt>Capacidade</dt><dd>{bus.capacity || '—'} lugares</dd></div>
                  {bus.decommissionedAt && (
                    <div>
                      <dt>Descomissionado em</dt>
                      <dd>{new Date(bus.decommissionedAt).toLocaleString(i18n.language === 'pt' ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd>
                    </div>
                  )}
                </dl>
              </section>
            </div>
          </div>
        </aside>
      </>
    );
  }

  return (
    <>
      <div className={`bdp-backdrop ${closing ? 'bdp-backdrop--closing' : ''}`} onClick={requestClose} />
      <aside className={`bdp-panel ${closing ? 'bdp-panel--closing' : ''}`} role="dialog" aria-modal="true">
        {/* Header */}
        <header className="bdp-header">
          <div>
            <div className="bdp-header-code">{bus.busCode}</div>
            <div className="bdp-header-route">
              {bus.routeCode ? `${bus.routeCode} · ${bus.routeName || ''}` : 'Sem linha'}
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
                    <div className="bdp-driver-name">
                      <span>{driver.name}</span>
                      {driver.mechanographicNumber && (
                        <span className="bdp-driver-mech">{driver.mechanographicNumber}</span>
                      )}
                    </div>
                    <div className="bdp-driver-meta">
                      {driver.phoneNumber && <span>{driver.phoneNumber}</span>}
                      <a
                        href={`/backoffice/drivers?q=${encodeURIComponent(driver.mechanographicNumber || '')}`}
                        className="inline-link"
                      >
                        {t('pages.buses.driverOpen')}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </a>
                      {/* Desatribuir motorista: SO' visivel se o bus estiver STOPPED. */}
                      {bus.status === 'STOPPED' && (
                        <button
                          type="button"
                          className="bdp-inline-action"
                          onClick={async () => {
                            try {
                              await api.post('/drivers/unassign', { driverId: driver.id });
                              onAction?.('refresh', bus);
                            } catch (err) {
                              toast.error(err?.response?.data?.message || err?.message || 'Erro', { autoClose: 6000 });
                            }
                          }}
                        >
                          {t('pages.buses.unassignDriverAction')}
                        </button>
                      )}
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

              {/* Main sensor */}
              <section className="bdp-section">
                <h4 className="bdp-section-title">{t('pages.buses.sensorTitle')}</h4>
                {sensor ? (
                  <div className="bdp-driver-card">
                    <div className="bdp-driver-name">{sensor.gateway}</div>
                    <div className="bdp-driver-meta">
                      {/* Pill de estado removida: o estado do sensor pertence
                          a pagina Sensores. Aqui basta o gateway + link + acao. */}
                      <a
                        href={`/backoffice/sensors?q=${encodeURIComponent(sensor.gateway || '')}`}
                        className="inline-link"
                      >
                        {t('pages.buses.sensorOpen')}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </a>
                      {/* Libertar sensor: SO' visivel se o bus estiver STOPPED. */}
                      {bus.status === 'STOPPED' && (
                        <button
                          type="button"
                          className="bdp-inline-action"
                          onClick={async () => {
                            try {
                              await api.put(`/sensors/${sensor.id}/unassign`);
                              onAction?.('refresh', bus);
                            } catch (err) {
                              toast.error(err?.response?.data?.message || err?.message || 'Erro', { autoClose: 6000 });
                            }
                          }}
                        >
                          {t('pages.buses.unassignSensorAction')}
                        </button>
                      )}
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
                      {t('pages.buses.sensorMissing')}{' '}
                      <a href="/backoffice/sensors" className="inline-link">
                        {t('pages.buses.assignInSensors')}
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
                </dl>
              </section>

              {/* Fase E (E-front-1): Escala (data corrente — o painel mostra a do dia de hoje). */}
              <section className="bdp-section">
                <h4 className="bdp-section-title">
                  {t('pages.buses.scheduleListTitle')}
                  <span className="bdp-section-date">{new Date(todayISO).toLocaleDateString(i18n.language === 'pt' ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </h4>
                {(() => {
                  // Sprint 5: vista operacional — esconde duties concluidas
                  // (DONE/CANCELLED/INTERRUPTED). O Calendar continua a
                  // mostrar tudo (incluindo historico) para auditoria.
                  const activeDuties = duties.filter(d =>
                    d.status === 'PLANNED' || d.status === 'RUNNING'
                  );
                  if (loadingDuties) {
                    return <div className="bdp-schedule-empty">{t('common.loading')}</div>;
                  }
                  if (activeDuties.length === 0) {
                    return <div className="bdp-schedule-empty">{t('pages.buses.scheduleEmpty')}</div>;
                  }
                  return (
                  <>
                    <div className="bdp-schedule-list">
                      {activeDuties.map(d => (
                        <div key={d.id} className="bdp-schedule-row">
                          <span className="bdp-schedule-time">{formatPlannedTime(d.plannedStart)}</span>
                          <span className="bdp-schedule-route">{d.routeShortName || '—'}</span>
                          <span className="bdp-schedule-headsign" title={d.tripHeadsign || d.tripDisplayName || ''}>
                            {d.tripHeadsign || d.tripDisplayName || `trip #${d.tripId}`}
                          </span>
                          <span className={`bdp-schedule-status bdp-schedule-status--${d.status}`}>{d.status}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bdp-schedule-footer">
                      <a
                        href={`/backoffice/calendar?bus=${encodeURIComponent(bus.busCode || '')}`}
                        className="bdp-schedule-link"
                      >
                        {t('pages.buses.scheduleOpenCalendar')}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </a>
                      {/* Remover escala: só visível com bus STOPPED. Delega
                          ao parent (Buses.jsx) que mostra o modal de confirmacao
                          consistente com o resto do produto. */}
                      {bus.status === 'STOPPED' && (
                        <button
                          type="button"
                          className="bdp-inline-action"
                          onClick={() => onAction?.('removeSchedule', bus)}
                        >
                          {t('pages.buses.removeSchedule')}
                        </button>
                      )}
                    </div>
                  </>
                  );
                })()}
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
                {bus.status === 'STOPPED' && (() => {
                  // Ativar exige motorista + main sensor + escala com 1a trip
                  // PLANNED com inicio no futuro (espelha o backend /start).
                  const nextPlanned = duties.find(d => d.status === 'PLANNED' && new Date(d.plannedStart).getTime() > Date.now());
                  const blockReason = !driver
                    ? t('pages.buses.activateNeedsDriver')
                    : !sensor
                      ? t('pages.buses.activateNeedsSensor')
                      : !nextPlanned
                        ? t('pages.buses.activateNeedsSchedule')
                        : '';
                  return (
                    <button
                      className="btn btn-success"
                      onClick={() => onAction('activate', bus)}
                      disabled={!!blockReason}
                      title={blockReason}
                    >
                      ▶ Ativar Autocarro
                    </button>
                  );
                })()}
                {/* Fase E (E-front-1): Planear escala — só faz sentido com o
                    autocarro PARADO. Em STARTING/EM_SERVICO/STOPPING já há
                    escala em curso, mostrar o botão (mesmo desactivado) é ruído. */}
                {isAdmin && bus.status === 'STOPPED' && (
                  <button
                    className="btn btn-primary"
                    onClick={() => onAction('planSchedule', bus)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'middle' }}>
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    {t('pages.buses.planSchedule')}
                  </button>
                )}
                {/* Editar e Descomissionar so' fazem sentido com o autocarro
                    PARADO. Em STARTING/EM_SERVICO/STOPPING ha' motorista e/ou
                    passageiros a bordo e qualquer alteracao a metadata (capacidade,
                    matricula, sensor) ou retirar o veiculo de servico em pleno
                    seria operacionalmente errado. */}
                {isAdmin && bus.status === 'STOPPED' && (
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
                              <MessageStatusIcon estado={msg.estado} />
                              {msg.estado === 'LIDA' && ' Lida'}
                              {msg.estado === 'ENTREGUE' && ' Entregue'}
                              {msg.estado === 'ENVIADA' && ' Enviada'}
                              {msg.estado === 'FALHOU' && ' Falhou'}
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
