import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { createStompClient } from '../services/stompClient';
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';
import { getMensagens } from '../services/despachoApi';
import ThemeSwitcher from '../components/ThemeSwitcher';
import Modal from '../components/Modal';
import AccountForm from '../components/AccountForm';
import Avatar from '../components/Avatar';
import './PainelBordo.css';

export default function PainelBordo() {
  const { authenticated, login, username, hasRole, logout } = useAuth();
  const { t } = useTranslation();

  const [busCode, setBusCode] = useState(null);
  const [bus, setBus] = useState(null);
  const [route, setRoute] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(new Date());
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [alertSending, setAlertSending] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountData, setAccountData] = useState(null);
  const stompRef = useRef(null);
  const chatEndRef = useRef(null);
  const currentStopRef = useRef(null);

  // Carrega dados da conta (1x ao autenticar) para popular o avatar do header.
  // Antes era on-demand; mudei para eager por causa do avatar no header.
  useEffect(() => {
    if (!authenticated || accountData) return;
    api.get('/me')
      .then(({ data }) => setAccountData(data))
      .catch(() => {
        // Silencioso — o avatar cai no letter avatar; nao bloqueia o painel.
      });
  }, [authenticated, accountData]);

  const handleSaveProfile = async (patch) => {
    try {
      const { data } = await api.patch('/me', patch);
      setAccountData(data);
      toast.success(t('pages.minhaConta.profileSaved'));
    } catch (err) {
      toast.error(err?.response?.data?.error || t('toasts.operationFailed'));
      throw err;
    }
  };

  const handleChangePassword = async (currentPassword, newPassword) => {
    try {
      await api.post('/me/password', { currentPassword, newPassword });
      toast.success(t('pages.minhaConta.passwordChanged'));
    } catch (err) {
      throw err;
    }
  };

  const handleUploadAvatar = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (data?.avatarUrl) {
      setAccountData((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
      window.dispatchEvent(new CustomEvent('pgu:avatar-updated', { detail: { avatarUrl: data.avatarUrl } }));
    }
    toast.success(t('pages.minhaConta.photoUploaded'));
    return data?.avatarUrl;
  };

  const handleDeleteAvatar = async () => {
    await api.delete('/me/avatar');
    setAccountData((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
    window.dispatchEvent(new CustomEvent('pgu:avatar-updated', { detail: { avatarUrl: null } }));
    toast.success(t('pages.minhaConta.photoRemoved'));
  };

  // Force login if not authenticated
  useEffect(() => {
    if (!authenticated) login();
  }, [authenticated, login]);

  const isMotorista = hasRole('motorista');

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch assigned bus
  useEffect(() => {
    if (!authenticated || !isMotorista) return;
    api.get('/drivers/me/bus')
      .then(({ data }) => setBusCode(data.busCode))
      .catch((err) => {
        const msg = err.response?.data?.message
                 || err.response?.data?.error
                 || err.message
                 || 'Erro desconhecido';
        console.error('Erro ao obter bus do motorista:', err.response?.status, err.response?.data);
        setError(msg);
      });
  }, [authenticated, isMotorista]);

  // Fetch bus + route
  const fetchData = useCallback(async () => {
    if (!busCode) return;
    try {
      const { data: busData } = await api.get(`/buses/code/${busCode}`);
      setBus(busData);
      if (busData.routeId) {
        const { data: routeData } = await api.get(`/routes/${busData.routeId}`);
        setRoute(routeData);
      }
    } catch {
      setError('Autocarro não encontrado: ' + busCode);
    }
  }, [busCode]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!busCode) return;
    try {
      const res = await getMensagens(busCode);
      // Backend devolve mais recentes primeiro; invertemos para chat normal (recente em baixo)
      const sorted = (res.data || [])
        .slice(0, 30)
        .sort((a, b) => new Date(a.timestampEnvio) - new Date(b.timestampEnvio));
      setMessages(sorted);
    } catch (err) {
      console.warn('fetchMessages falhou:', err.response?.status, err.response?.data);
    }
  }, [busCode]);

  useEffect(() => {
    if (!busCode) return;
    fetchData();
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [busCode, fetchData, fetchMessages]);

  // WebSocket
  useEffect(() => {
    if (!busCode) return;
    // Sprint -1 (SEC-4): client autenticado via JWT no CONNECT.
    const client = createStompClient({
      onConnect: () => {
        client.subscribe('/topic/telemetry', (message) => {
          try {
            const t = JSON.parse(message.body);
            if (t.busId === busCode) setTelemetry(t);
          } catch { /* ignore */ }
        });
        client.subscribe(`/topic/despacho/${busCode}`, () => fetchMessages());
      },
    });
    client.activate();
    stompRef.current = client;
    return () => client.deactivate();
  }, [busCode, fetchMessages]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-center the current stop in the route list whenever it changes.
  // Utilizador pode scrollar manualmente; ao mudar de paragem, volta a centrar.
  useEffect(() => {
    currentStopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [telemetry?.nextStop]);

  // Send message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/despacho/${busCode}/mensagens/motorista`, { conteudo: chatInput.trim() });
      setChatInput('');
      fetchMessages();
    } catch (err) {
      console.error('Erro ao enviar mensagem', err);
    } finally {
      setSending(false);
    }
  };

  // Report alert
  const handleAlert = async (tipo) => {
    if (alertSending) return;
    setAlertSending(tipo);
    try {
      await api.post('/ocorrencias/motorista', { tipo, busCode });
      setAlertSending('ok-' + tipo);
      setTimeout(() => setAlertSending(null), 2000);
    } catch {
      setAlertSending(null);
    }
  };

  const timeStr = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

  // Modal partilhado por todos os branches de render (incl. quando o motorista
  // nao tem autocarro atribuido). Renderiza-se sempre e fica oculto enquanto
  // accountOpen === false.
  const accountModal = (
    <Modal
      open={accountOpen}
      onClose={() => setAccountOpen(false)}
      title={t('pages.bordo.accountModalTitle')}
    >
      <AccountForm
        initialData={accountData}
        onSaveProfile={handleSaveProfile}
        onChangePassword={handleChangePassword}
        onUploadAvatar={handleUploadAvatar}
        onDeleteAvatar={handleDeleteAvatar}
        compact
      />
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={() => setAccountOpen(false)}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  );

  // Botao "Conta" reutilizado nos varios branches (loading/error/main).
  // O avatar substitui o icone generico — feedback visual imediato de qual
  // utilizador esta loggado no painel.
  const accountButton = (
    <button
      type="button"
      className="pb-account-btn"
      onClick={() => setAccountOpen(true)}
      title={t('pages.bordo.accountButton')}
      aria-label={t('pages.bordo.accountButton')}
    >
      <Avatar
        url={accountData?.avatarUrl}
        name={
          [accountData?.firstName, accountData?.lastName].filter(Boolean).join(' ').trim()
          || accountData?.username
          || username
        }
        size="sm"
      />
      <span>{t('pages.bordo.accountButton')}</span>
    </button>
  );

  // --- Guard screens ---
  if (!authenticated) {
    return (
      <div className="pb-container">
        <div className="pb-loading">A redirecionar para login...</div>
      </div>
    );
  }

  if (!isMotorista) {
    return (
      <div className="pb-container">
        <div className="pb-error">
          <div className="pb-error-icon">!</div>
          <h2>Acesso restrito</h2>
          <p>A conta <strong>{username}</strong> não tem permissão de motorista.</p>
          <button className="pb-btn pb-btn--secondary" onClick={logout}>Sair</button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pb-container">
        <div className="pb-error">
          <div className="pb-error-icon">!</div>
          <h2>{error}</h2>
          <p>Contacte o administrador para atribuir um autocarro.</p>
          <div className="pb-error-actions">
            {accountButton}
            <button className="pb-btn pb-btn--secondary" onClick={logout}>Sair</button>
          </div>
        </div>
        {accountModal}
      </div>
    );
  }

  if (!bus) {
    return (
      <div className="pb-container">
        <div className="pb-loading">A carregar painel de bordo...</div>
        {accountModal}
      </div>
    );
  }

  const speed = telemetry?.speed?.toFixed(0) ?? '—';
  const passengers = telemetry?.passengers ?? telemetry?.passengerCount ?? '—';
  const status = telemetry?.status ?? bus.status ?? 'STOPPED';
  const nextStop = telemetry?.nextStop ?? '—';
  const stops = route?.stops || [];

  const statusLabels = {
    'active': 'Em serviço', 'at-stop': 'Na paragem', 'stopping': 'A parar',
    'delayed': 'Atrasado', 'stopped': 'Parado', 'STOPPED': 'Parado', 'ACTIVE': 'Em serviço',
  };
  const statusColors = {
    'active': '#10b981', 'at-stop': '#6366f1', 'stopping': '#f59e0b',
    'delayed': '#ef4444', 'stopped': '#94a3b8', 'STOPPED': '#94a3b8', 'ACTIVE': '#10b981',
  };

  const isFromDriver = (msg) => msg.operador?.startsWith('motorista:');

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
          {accountButton}
          <div className="pb-theme">
            <ThemeSwitcher />
          </div>
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
                return (
                  <div
                    key={stop.stopId || i}
                    ref={isCurrent ? currentStopRef : null}
                    className={`pb-stop ${isCurrent ? 'pb-stop--current' : ''}`}
                  >
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

          {/* Chat */}
          <section className="pb-section pb-messages">
            <h3 className="pb-section-title">Mensagens</h3>
            <div className="pb-message-list">
              {messages.length === 0 && (
                <div className="pb-empty pb-empty--centered">Sem mensagens</div>
              )}
              {messages.map(msg => {
                const sent = isFromDriver(msg);
                const stateIcon =
                  msg.estado === 'LIDA' ? '✓✓' :
                  msg.estado === 'ENTREGUE' ? '✓✓' :
                  msg.estado === 'ENVIADA' ? '✓' :
                  msg.estado === 'FALHOU' ? '!' : '';
                return (
                  <div key={msg.id} className={`pb-message ${sent ? 'pb-message--sent' : 'pb-message--received'}`}>
                    {!sent && <div className="pb-message-sender">Despacho</div>}
                    <div className="pb-message-content">{msg.conteudo}</div>
                    <div className="pb-message-meta">
                      <span className="pb-message-time">
                        {new Date(msg.timestampEnvio).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {sent && (
                        <span className={`pb-message-tick pb-message-tick--${msg.estado?.toLowerCase()}`}>
                          {stateIcon}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <form className="pb-chat-form" onSubmit={handleSendMessage}>
              <input
                className="pb-chat-input"
                type="text"
                placeholder="Escrever mensagem ao despacho..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={140}
                disabled={sending}
              />
              <button type="submit" className="pb-chat-send" disabled={sending || !chatInput.trim()}>
                {sending ? '...' : 'Enviar'}
              </button>
            </form>
          </section>

          {/* Alert buttons */}
          <section className="pb-section pb-alerts">
            <h3 className="pb-section-title">Alertas</h3>
            <div className="pb-alert-buttons">
              <button
                className={`pb-alert-btn pb-alert-btn--avaria ${alertSending === 'ok-AVARIA' ? 'pb-alert-btn--success' : ''}`}
                onClick={() => handleAlert('AVARIA')}
                disabled={!!alertSending}
              >
                {alertSending === 'AVARIA' ? 'A reportar...' : alertSending === 'ok-AVARIA' ? 'Reportada' : 'Reportar Avaria'}
              </button>
              <button
                className={`pb-alert-btn pb-alert-btn--acidente ${alertSending === 'ok-ACIDENTE' ? 'pb-alert-btn--success' : ''}`}
                onClick={() => handleAlert('ACIDENTE')}
                disabled={!!alertSending}
              >
                {alertSending === 'ACIDENTE' ? 'A reportar...' : alertSending === 'ok-ACIDENTE' ? 'Reportado' : 'Reportar Acidente'}
              </button>
            </div>
          </section>
        </div>
      </div>
      {accountModal}
    </div>
  );
}
