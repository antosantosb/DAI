import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { createStompClient } from '../services/stompClient';
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';
import { getMensagens } from '../services/despachoApi';
import ThemeSwitcher from '../components/ThemeSwitcher';
import LanguageSwitcher from '../components/LanguageSwitcher';
import Modal from '../components/Modal';
import AccountForm from '../components/AccountForm';
import Avatar from '../components/Avatar';
import MessageStatusIcon from '../components/MessageStatusIcon';
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

  // Fase E (E-front-2): escala do dia + Iniciar/Terminar Servico.
  // duties: lista ordenada (BusDutyDTO) com status PLANNED/RUNNING/DONE/CANCELLED/INTERRUPTED.
  // hasSensor: gate de Iniciar (precisa de main sensor atribuido).
  // serviceAction: 'start' | 'end' | null (loading flag dos CTAs).
  const [duties, setDuties] = useState([]);
  const [dutiesLoaded, setDutiesLoaded] = useState(false);
  // Paragens da trip actual (modelo Transmodel): carregadas a partir do
  // pattern da duty RUNNING (fallback: primeira PLANNED). O bus ja' nao
  // tem rota fixa, portanto a lista de paragens vem da trip activa.
  const [patternStops, setPatternStops] = useState([]);
  const [hasSensor, setHasSensor] = useState(false);
  const [serviceAction, setServiceAction] = useState(null);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  // "Hora X": instante em que o motorista deve sair da central TUB para
  // chegar a tempo a primeira paragem. departure: DTO do backend.
  // tick: ref-time para o cronometro decrescente (1s).
  const [departure, setDeparture] = useState(null);
  const [tickNow, setTickNow] = useState(Date.now());

  // Sprint 5 (follow-up): bloqueio JS do scroll #root/body enquanto o
  // painel de bordo esta montado. Backup para browsers sem :has() robusto.
  // O index.css tem `#root { overflow-y: auto; height: calc(100vh - 32px) }`
  // que causa a scrollbar global. Aqui fazemos override e restauramos no
  // unmount para nao afectar outras paginas.
  useEffect(() => {
    const root = document.getElementById('root');
    const prev = {
      rootOverflow: root?.style.overflow,
      rootHeight: root?.style.height,
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
    };
    if (root) {
      root.style.overflow = 'hidden';
      root.style.height = '100vh';
    }
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      if (root) {
        root.style.overflow = prev.rootOverflow;
        root.style.height = prev.rootHeight;
      }
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.body.style.overflow = prev.bodyOverflow;
    };
  }, []);

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
      // Sprint 1 follow-up: ao mudar password, o refresh token desta sessão
      // é invalidado. Logout intencional com toast claro evita ser despejado
      // pelo axios interceptor para a Landing.
      toast.success(t('pages.minhaConta.passwordChangedReLogin'), { autoClose: 4000 });
      setTimeout(() => { logout(); }, 1500);
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
                 || t('pages.painelBordo.unknownError');
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
      setError(t('pages.painelBordo.busNotFound', { busCode }));
    }
  }, [busCode, t]);

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
        client.subscribe(`/topic/mensagens/${busCode}`, () => fetchMessages());
      },
    });
    client.activate();
    stompRef.current = client;
    return () => client.deactivate();
  }, [busCode, fetchMessages]);

  // Fase E: data de hoje na timezone de Lisboa, em YYYY-MM-DD.
  const todayISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' });

  // Carrega a escala do dia (BusDuty). Best-effort: em caso de falha, deixa a
  // lista anterior para nao "piscar" o painel.
  const fetchDuties = useCallback(async () => {
    if (!bus?.id) return;
    try {
      const { data } = await api.get(`/buses/${bus.id}/duties`, { params: { date: todayISO() } });
      setDuties(Array.isArray(data) ? data : []);
    } catch {
      // best-effort
    } finally {
      setDutiesLoaded(true);
    }
  }, [bus?.id]);

  // O motorista nao tem acesso a /api/v1/sensors (endpoint admin-only).
  // O gate de sensor passou a ser validado APENAS pelo backend em /start —
  // se faltar, o backend devolve 409 com mensagem clara e mostramos toast.
  useEffect(() => { fetchDuties(); }, [fetchDuties]);

  // Carrega as paragens nominais do pattern da trip actual sempre que a
  // duty RUNNING (ou a proxima PLANNED) muda. Mantem o cache enquanto o
  // patternId for o mesmo, evitando refetch em cada poll de duties.
  const loadedPatternIdRef = useRef(null);
  useEffect(() => {
    if (!duties || duties.length === 0) {
      setPatternStops([]);
      loadedPatternIdRef.current = null;
      return;
    }
    const target = duties.find(d => d.status === 'RUNNING')
                || duties.find(d => d.status === 'PLANNED');
    const patternId = target?.patternId;
    if (!patternId) {
      setPatternStops([]);
      loadedPatternIdRef.current = null;
      return;
    }
    if (loadedPatternIdRef.current === patternId) return;
    loadedPatternIdRef.current = patternId;
    api.get(`/patterns/${patternId}/stops`)
      .then(({ data }) => {
        // Endpoint devolve {stopId, stopName, stopCode, sequence}. Mapear
        // `sequence` para `stopOrder` para reutilizar o render que usa
        // .stopOrder; manter restante shape igual.
        const list = (Array.isArray(data) ? data : []).map(s => ({
          stopId:   s.stopId,
          stopName: s.stopName,
          stopCode: s.stopCode,
          stopOrder: s.sequence,
        }));
        setPatternStops(list);
      })
      .catch(() => setPatternStops([]));
  }, [duties]);

  // Polling 10s quando o servico esta em curso ou em deadhead para a central.
  // STOPPED nao precisa porque a escala so muda por acao do motorista.
  useEffect(() => {
    const st = bus?.status;
    if (st !== 'EM_SERVICO' && st !== 'STOPPING') return undefined;
    const iv = setInterval(() => { fetchDuties(); fetchData(); }, 10000);
    return () => clearInterval(iv);
  }, [bus?.status, fetchDuties, fetchData]);

  // "Hora X": fetch 1x quando o bus carrega e esta em STOPPED. Sem polling
  // (a Hora X e' fixa para o dia; o cronometro decrescente roda localmente).
  useEffect(() => {
    if (!bus?.id) return;
    if (bus.status !== 'STOPPED') { setDeparture(null); return; }
    api.get('/drivers/me/departure')
      .then(({ data }) => setDeparture(data))
      .catch(() => setDeparture(null));
  }, [bus?.id, bus?.status]);

  // Tick a cada 1s para o cronometro / minutos de atraso. So' enquanto
  // o bus esta STOPPED e ha Hora X conhecida (poupa renders).
  useEffect(() => {
    if (bus?.status !== 'STOPPED') return undefined;
    if (!departure || !departure.horaX) return undefined;
    const iv = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [bus?.status, departure]);

  // Acoes de servico. POST /api/v1/buses/{id}/start | /end.
  // Em 409, mostra a mensagem do servidor; backend valida tudo a serio.
  // Tipo de partida (EARLY / ON_TIME / LATE) baseado em "agora vs Hora X".
  // Janela de tolerancia de 30s para considerar "no segundo zero" (ON_TIME).
  const computeDepartureType = () => {
    if (!departure || !departure.horaX) return null;
    const diff = (new Date(departure.horaX).getTime() - Date.now()) / 1000;
    if (diff > 30) return 'EARLY';
    if (diff < -30) return 'LATE';
    return 'ON_TIME';
  };

  const handleStart = async () => {
    if (serviceAction || !bus?.id) return;
    setServiceAction('start');
    try {
      const departureType = computeDepartureType();
      const body = departureType ? { departureType } : {};
      const { data } = await api.post(`/buses/${bus.id}/start`, body);
      setBus(data);
      // Feedback do tipo de partida (cedo / pontual / atrasado).
      if (departureType) {
        const key = departureType === 'EARLY' ? 'pages.painelBordo.service.departureEarly'
                  : departureType === 'LATE'  ? 'pages.painelBordo.service.departureLate'
                  :                              'pages.painelBordo.service.departureOnTime';
        toast.success(t(key));
      } else {
        toast.success(t('pages.painelBordo.service.startSuccess'));
      }
      fetchDuties();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || t('toasts.operationFailed'));
    } finally {
      setServiceAction(null);
    }
  };

  const handleEnd = async () => {
    if (serviceAction || !bus?.id) return;
    setServiceAction('end');
    try {
      const { data } = await api.post(`/buses/${bus.id}/end`);
      setBus(data);
      toast.success(t('pages.painelBordo.service.endSuccess'));
      fetchDuties();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || t('toasts.operationFailed'));
    } finally {
      setServiceAction(null);
      setConfirmEndOpen(false);
    }
  };

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
      <span className="pb-account-meta">
        <span className="pb-account-name">
          {[accountData?.firstName, accountData?.lastName].filter(Boolean).join(' ').trim() || username}
        </span>
        <span className="pb-account-role">{t('auth.roles.motorista', 'Motorista')}</span>
      </span>
    </button>
  );

  // --- Guard screens ---
  if (!authenticated) {
    return (
      <div className="pb-container">
        <div className="pb-loading">{t('pages.painelBordo.redirectingLogin')}</div>
      </div>
    );
  }

  if (!isMotorista) {
    return (
      <div className="pb-container">
        <div className="pb-error">
          <div className="pb-error-icon">!</div>
          <h2>{t('pages.painelBordo.restrictedTitle')}</h2>
          <p>
            {t('pages.painelBordo.restrictedAccountPrefix')}
            <strong>{username}</strong>
            {t('pages.painelBordo.restrictedAccountSuffix')}
          </p>
          <button className="pb-btn pb-btn--secondary" onClick={logout}>{t('pages.painelBordo.logout')}</button>
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
          <p>{t('pages.painelBordo.contactAdmin')}</p>
          <div className="pb-error-actions">
            {accountButton}
            <button className="pb-btn pb-btn--secondary" onClick={logout}>{t('pages.painelBordo.logout')}</button>
          </div>
        </div>
        {accountModal}
      </div>
    );
  }

  if (!bus) {
    return (
      <div className="pb-container">
        <div className="pb-loading">{t('pages.painelBordo.loadingPanel')}</div>
        {accountModal}
      </div>
    );
  }

  // Guard "sem escala": se o bus esta STOPPED e o backend ja respondeu sem
  // duties para hoje, bloqueia o painel (operacao requer escala). Igual ao
  // padrao "sem autocarro": pagina minima com mensagem + logout.
  if (bus.status === 'STOPPED' && dutiesLoaded && duties.length === 0) {
    return (
      <div className="pb-container">
        <div className="pb-error">
          <div className="pb-error-icon">!</div>
          <h2>{t('pages.painelBordo.noScheduleTitle')}</h2>
          <p>{t('pages.painelBordo.noScheduleText', { code: bus.busCode })}</p>
          <div className="pb-error-actions">
            {accountButton}
            <button className="pb-btn pb-btn--secondary" onClick={logout}>{t('pages.painelBordo.logout')}</button>
          </div>
        </div>
        {accountModal}
      </div>
    );
  }

  const speed = telemetry?.speed?.toFixed(0) ?? '—';
  const passengers = telemetry?.passengers ?? telemetry?.passengerCount ?? '—';
  const status = telemetry?.status ?? bus.status ?? 'STOPPED';
  const nextStop = telemetry?.nextStop ?? '—';
  // Preferir as paragens do pattern da trip actual (modelo Transmodel).
  // Fallback ao route.stops legado (bus com routeId fixo, pre-Fase 1).
  const stops = patternStops.length > 0 ? patternStops : (route?.stops || []);


  // Fase E: estados canonicos do autocarro vem de bus.status. Mantemos as
  // chaves legacy ('active', 'at-stop', etc.) para tolerar telemetria intermedia.
  const busStatus = bus?.status || status;
  const statusLabels = {
    'active': t('pages.painelBordo.status.active'),
    'at-stop': t('pages.painelBordo.status.atStop'),
    'stopping': t('pages.painelBordo.status.stopping'),
    'delayed': t('pages.painelBordo.status.delayed'),
    'stopped': t('pages.painelBordo.status.stopped'),
    'STOPPED': t('pages.painelBordo.status.stoppedBadge'),
    'STARTING': t('pages.painelBordo.status.startingBadge'),
    'EM_SERVICO': t('pages.painelBordo.status.emServico'),
    'STOPPING': t('pages.painelBordo.status.stoppingBadge'),
    'DECOMMISSIONED': t('pages.painelBordo.status.decommissioned'),
    'ACTIVE': t('pages.painelBordo.status.active'),
  };
  const statusColors = {
    'active': '#10b981', 'at-stop': '#009BDB', 'stopping': '#f59e0b',
    'delayed': '#ef4444', 'stopped': '#94a3b8',
    'STOPPED': '#94a3b8', 'STARTING': '#0ea5e9', 'EM_SERVICO': '#10b981', 'STOPPING': '#f59e0b', 'DECOMMISSIONED': '#ef4444',
    'ACTIVE': '#10b981',
  };

  // Helpers para badges de duty (escala).
  const dutyStatusLabel = (s) => ({
    'PLANNED': t('pages.painelBordo.duty.statusPlanned'),
    'RUNNING': t('pages.painelBordo.duty.statusRunning'),
    'DONE': t('pages.painelBordo.duty.statusDone'),
    'CANCELLED': t('pages.painelBordo.duty.statusCancelled'),
    'INTERRUPTED': t('pages.painelBordo.duty.statusInterrupted'),
  }[s] || s);
  const fmtHM = (iso) => {
    try { return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }); }
    catch { return '—'; }
  };

  // Razao de bloqueio do Iniciar (apenas para UX clara; o backend valida tudo
  // a serio no /start, incluindo escala e estado). Aqui so' bloqueamos pelo
  // sensor (esse e' garantido localmente). A escala/Hora X passa a depender
  // sempre do backend para evitar dessincronizacoes entre /duties e /departure.
  // Gate frontend dispensado: motorista nao tem acesso a /api/v1/sensors
  // (esse endpoint e admin/funcionario/developer). O backend valida tudo
  // a serio em /start (motorista, sensor, escala, hora). Aqui nao bloqueamos.
  const startDisabledReason = null;

  const isFromDriver = (msg) => msg.operador?.startsWith('motorista:');

  return (
    <div className="pb-container">
      {/* Header */}
      <header className="pb-header">
        <div className="pb-header-left">
          <div className="pb-bus-code">{busCode}</div>
          <div className="pb-route-name">
            {/* Prefere a linha actual derivada da duty RUNNING (vinda no BusDTO):
                a escala pode ter varias linhas, por isso o header tem de
                mostrar a linha que esta' a decorrer, nao a 1a do dia. */}
            {bus?.currentRouteCode
              ? `${bus.currentRouteCode}${bus.currentRouteName ? ` , ${bus.currentRouteName}` : ''}`
              : (route ? `${route.code} , ${route.name}` : t('pages.painelBordo.noRouteAssigned'))}
          </div>
        </div>
        <div className="pb-header-center">
          <div className="pb-clock">{timeStr}</div>
          <div className="pb-date">{dateStr}</div>
        </div>
        <div className="pb-header-right">
          <span className="pb-status-badge" style={{ background: statusColors[busStatus] || '#94a3b8' }}>
            {statusLabels[busStatus] || busStatus}
          </span>
          {accountButton}
          <button
            type="button"
            className="pb-logout-btn"
            onClick={logout}
            title={t('pages.painelBordo.logout')}
            aria-label={t('pages.painelBordo.logout')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>{t('pages.painelBordo.logout')}</span>
          </button>
          <div className="pb-theme">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      {/* Main content — layout em 3 colunas via CSS grid + display:contents.
          Ordem visual: Servico (col 1) | Info-Rota-Stats (col 2) | Chat-Alertas (col 3). */}
      <div className="pb-main">
        <section className="pb-section pb-route-section">
          <h3 className="pb-section-title">{t('pages.painelBordo.route.title')}</h3>
          <div className="pb-route-list">
            {stops.length === 0 ? (
              <div className="pb-empty">{t('pages.painelBordo.route.noStops')}</div>
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

        {/* Wrapper "transparente" via display:contents — os filhos viram
            celulas directas do grid e ganham grid-column via CSS. */}
        <div className="pb-right-col">
          {/* Stats — COLUNA 2 (info), acima da rota. */}
          <section className="pb-section pb-stats">
            <div className="pb-stat">
              <span className="pb-stat-value">{speed}</span>
              <span className="pb-stat-label">km/h</span>
            </div>
            <div className="pb-stat">
              <span className="pb-stat-value">{passengers}</span>
              <span className="pb-stat-label">{t('pages.painelBordo.tele.passengers')}</span>
            </div>
            <div className="pb-stat pb-stat--next">
              <span className="pb-stat-label">{t('pages.painelBordo.tele.nextStop')}</span>
              <span className="pb-stat-value pb-stat-value--small">{nextStop}</span>
            </div>
          </section>

          {/* Fase E: Escala de hoje + CTAs Iniciar/Terminar Servico */}
          <section className="pb-section pb-service">
            {/* "Hora X": cronometro ou alerta de atraso. Apenas STOPPED. */}
            {bus?.status === 'STOPPED' && departure && departure.mode !== 'NO_SCHEDULE' && (() => {
              const horaXMs = new Date(departure.horaX).getTime();
              const remainSec = Math.round((horaXMs - tickNow) / 1000);
              const isBefore = remainSec > 0;
              const fmtHHMM = (iso) => {
                try { return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }); }
                catch { return '—'; }
              };
              const fmtCountdown = (s) => {
                const sign = s < 0 ? '+' : '−';
                const abs = Math.abs(s);
                const h = Math.floor(abs / 3600);
                const m = Math.floor((abs % 3600) / 60);
                const ss = abs % 60;
                if (h > 0) return `${sign}${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
                return `${sign}${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
              };
              return (
                <div className={`pb-hora-x ${isBefore ? 'pb-hora-x--before' : 'pb-hora-x--after'}`}>
                  <div className="pb-hora-x-head">
                    <span className="pb-hora-x-label">{t('pages.painelBordo.horaX.label')}</span>
                    <span className="pb-hora-x-time">{fmtHHMM(departure.horaX)}</span>
                  </div>
                  <div className="pb-hora-x-countdown">
                    {fmtCountdown(remainSec)}
                  </div>
                  <div className="pb-hora-x-context">
                    {isBefore
                      ? t('pages.painelBordo.horaX.beforeMsg', {
                          stop: departure.firstStopName || '—',
                          plannedStart: fmtHHMM(departure.plannedStart),
                        })
                      : t('pages.painelBordo.horaX.afterMsg', {
                          delay: Math.max(1, Math.ceil(Math.abs(remainSec) / 60)),
                          stop: departure.firstStopName || '—',
                        })}
                  </div>
                </div>
              );
            })()}
            <h3 className="pb-section-title">{t('pages.painelBordo.duty.title')}</h3>
            <div className="pb-duty-list">
              {(() => {
                // Sprint 5: o motorista so' vê o que falta fazer. Esconde
                // DONE/CANCELLED/INTERRUPTED para nao poluir o painel quando
                // ja completou trips/escala da manha e tem nova escala
                // planeada para a tarde. Calendar continua a mostrar tudo.
                const activeDuties = duties.filter(d =>
                  d.status === 'PLANNED' || d.status === 'RUNNING'
                );
                if (activeDuties.length === 0) {
                  return <div className="pb-empty pb-empty--centered">{t('pages.painelBordo.duty.empty')}</div>;
                }
                return activeDuties.map((d) => {
                  const isRunning = d.status === 'RUNNING';
                  const tripName = d.tripHeadsign || d.displayName || `Trip ${d.tripId}`;
                  return (
                    <div key={d.id} className={`pb-duty ${isRunning ? 'pb-duty--running' : ''} pb-duty--${(d.status || '').toLowerCase()}`}>
                      <div className="pb-duty-time">{fmtHM(d.plannedStart)}</div>
                      <div className="pb-duty-main">
                        {d.routeShortName && <span className="pb-duty-route">{d.routeShortName}</span>}
                        <span className="pb-duty-name">{tripName}</span>
                      </div>
                      <span className={`pb-duty-badge pb-duty-badge--${(d.status || '').toLowerCase()}`}>
                        {dutyStatusLabel(d.status)}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="pb-service-actions">
              {busStatus === 'STOPPED' && (
                <button
                  type="button"
                  className="pb-service-btn pb-service-btn--start"
                  onClick={handleStart}
                  disabled={!!serviceAction || !!startDisabledReason}
                  title={startDisabledReason || ''}
                >
                  {serviceAction === 'start'
                    ? t('pages.painelBordo.service.starting')
                    : t('pages.painelBordo.service.start')}
                </button>
              )}
              {busStatus === 'EM_SERVICO' && (
                <button
                  type="button"
                  className="pb-service-btn pb-service-btn--end"
                  onClick={() => setConfirmEndOpen(true)}
                  disabled={!!serviceAction}
                >
                  {serviceAction === 'end'
                    ? t('pages.painelBordo.service.ending')
                    : t('pages.painelBordo.service.end')}
                </button>
              )}
              {busStatus === 'STARTING' && (
                <div className="pb-service-notice pb-service-notice--starting">
                  {t('pages.painelBordo.service.startingNotice')}
                </div>
              )}
              {busStatus === 'STOPPING' && (
                <div className="pb-service-notice">{t('pages.painelBordo.service.stoppingNotice')}</div>
              )}
              {busStatus === 'DECOMMISSIONED' && (
                <div className="pb-service-notice pb-service-notice--decommissioned">
                  {t('pages.painelBordo.service.decommissionedNotice')}
                </div>
              )}
            </div>
          </section>

          {/* Chat */}
          <section className="pb-section pb-messages">
            <h3 className="pb-section-title">{t('pages.painelBordo.chat.title')}</h3>
            <div className="pb-message-list">
              {messages.length === 0 && (
                <div className="pb-empty pb-empty--centered">{t('pages.painelBordo.chat.empty')}</div>
              )}
              {messages.map(msg => {
                const sent = isFromDriver(msg);
                const stateIcon = <MessageStatusIcon estado={msg.estado} />;
                return (
                  <div key={msg.id} className={`pb-message ${sent ? 'pb-message--sent' : 'pb-message--received'}`}>
                    {!sent && <div className="pb-message-sender">{t('pages.painelBordo.chat.dispatchSender')}</div>}
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
                placeholder={t('pages.painelBordo.chat.placeholder')}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={140}
                disabled={sending}
              />
              <button type="submit" className="pb-chat-send" disabled={sending || !chatInput.trim()}>
                {sending ? '...' : t('pages.painelBordo.chat.send')}
              </button>
            </form>
          </section>

          {/* Alert buttons */}
          <section className="pb-section pb-alerts">
            <h3 className="pb-section-title">{t('pages.painelBordo.incident.title')}</h3>
            <div className="pb-alert-buttons">
              <button
                className={`pb-alert-btn pb-alert-btn--avaria ${alertSending === 'ok-AVARIA' ? 'pb-alert-btn--success' : ''}`}
                onClick={() => handleAlert('AVARIA')}
                disabled={!!alertSending}
              >
                {alertSending === 'AVARIA'
                  ? t('pages.painelBordo.incident.reportingFemale')
                  : alertSending === 'ok-AVARIA'
                    ? t('pages.painelBordo.incident.reportedFemale')
                    : t('pages.painelBordo.incident.reportBreakdown')}
              </button>
              <button
                className={`pb-alert-btn pb-alert-btn--acidente ${alertSending === 'ok-ACIDENTE' ? 'pb-alert-btn--success' : ''}`}
                onClick={() => handleAlert('ACIDENTE')}
                disabled={!!alertSending}
              >
                {alertSending === 'ACIDENTE'
                  ? t('pages.painelBordo.incident.reportingMale')
                  : alertSending === 'ok-ACIDENTE'
                    ? t('pages.painelBordo.incident.reportedMale')
                    : t('pages.painelBordo.incident.reportAccident')}
              </button>
              {/* Sprint 5 (3.3): botao FRAUDE — deteccao MANUAL pelo motorista
                  (R.IPB.06, D-IPB-6). Reusa POST /ocorrencias/motorista; o
                  backend cria Ocorrencia tipoAnomalia='FRAUDE'. */}
              <button
                className={`pb-alert-btn pb-alert-btn--fraude ${alertSending === 'ok-FRAUDE' ? 'pb-alert-btn--success' : ''}`}
                onClick={() => handleAlert('FRAUDE')}
                disabled={!!alertSending}
              >
                {alertSending === 'FRAUDE'
                  ? t('pages.painelBordo.incident.reportingFemale')
                  : alertSending === 'ok-FRAUDE'
                    ? t('pages.painelBordo.incident.reportedFemale')
                    : t('pages.painelBordo.incident.reportFraud')}
              </button>
            </div>
          </section>
        </div>
      </div>
      <Modal
        open={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        title={t('pages.painelBordo.service.end')}
      >
        <p style={{ margin: '8px 0 16px' }}>{t('pages.painelBordo.service.endConfirm')}</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => setConfirmEndOpen(false)} disabled={serviceAction === 'end'}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger" onClick={handleEnd} disabled={serviceAction === 'end'}>
            {serviceAction === 'end' ? t('pages.painelBordo.service.ending') : t('pages.painelBordo.service.end')}
          </button>
        </div>
      </Modal>
      {accountModal}
    </div>
  );
}
