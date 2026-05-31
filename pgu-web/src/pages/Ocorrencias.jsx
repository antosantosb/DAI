import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Client } from '@stomp/stompjs';
import api from '../services/api';
import { getMensagens, enviarMensagem, reenviarMensagem, cancelarMensagem } from '../services/despachoApi';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  getOcorrencias,
  criarOcorrencia,
  getOcorrencia,
  assumirOcorrencia,
  atribuirOcorrencia,
  fecharOcorrencia,
  marcarFalsoPositivo,
  registarAcaoCorretiva,
  uploadAnexo,
  getAnexos,
  getTelemetriaAtivo
} from '../services/ocorrenciasApi';
import { useAuth } from '../context/AuthProvider';
import './Ocorrencias.css';

export default function Ocorrencias() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { username, roles } = useAuth();

  // General state
  const [ocorrencias, setOcorrencias] = useState([]);
  const [activeAlarms, setActiveAlarms] = useState([]);
  const [loading, setLoading] = useState(true);

  // List view tabs: 'ativos' (open occurrences) | 'historico' (full table)
  const [activeTab, setActiveTab] = useState('ativos');

  // Filters state
  const [estadoFilter, setEstadoFilter] = useState('');
  const [ativoFilter, setAtivoFilter] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selected occurrence state (detail modal)
  const [selectedOcorrencia, setSelectedOcorrencia] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [actionNotes, setActionNotes] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [uploading, setUploading] = useState(false);

  // Active Asset Telemetry history subflow state
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);

  // Chat with driver state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState('');
  const [activeDriver, setActiveDriver] = useState(null);
  const [loadingDriver, setLoadingDriver] = useState(false);
  const chatEndRef = useRef(null);

  // Create occurrence modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAtivoId, setNewAtivoId] = useState('');
  const [newTipoAtivo, setNewTipoAtivo] = useState('BUS');
  const [newTipoAnomalia, setNewTipoAnomalia] = useState('SOBREAQUECIMENTO');
  const [newPrioridade, setNewPrioridade] = useState('NORMAL');
  const [newDescricao, setNewDescricao] = useState('');
  const [newNotasIniciais, setNewNotasIniciais] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [technicians, setTechnicians] = useState([]);

  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        const res = await api.get('/users');
        const maintenanceUsers = (res.data || []).filter(u => u.roles && u.roles.includes('maintenance'));
        setTechnicians(maintenanceUsers);
      } catch (err) {
        console.warn('Erro ao carregar técnicos de manutenção:', err);
      }
    };
    fetchTechnicians();
  }, []);

  const handleCreateOccurrence = async (e) => {
    e.preventDefault();
    if (!newAtivoId.trim()) {
      toast.warn("Por favor, indique o ID do ativo.");
      return;
    }
    setSubmittingCreate(true);
    try {
      const payload = {
        ativoId: newAtivoId.trim(),
        tipoAtivo: newTipoAtivo,
        tipoAnomalia: newTipoAnomalia,
        prioridade: newPrioridade,
        descricao: newDescricao.trim(),
        notasIniciais: newNotasIniciais.trim()
      };
      await criarOcorrencia(payload);
      toast.success("Ocorrência registada com sucesso!");
      setShowCreateModal(false);
      // Reset form
      setNewAtivoId('');
      setNewTipoAtivo('BUS');
      setNewTipoAnomalia('SOBREAQUECIMENTO');
      setNewPrioridade('NORMAL');
      setNewDescricao('');
      setNewNotasIniciais('');
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao registar ocorrência: " + (err.response?.data?.message || err.message));
    } finally {
      setSubmittingCreate(false);
    }
  };

  const isMsgFromDriver = (msg) => msg.operador?.startsWith('motorista:');

  const isSupervisorOrAdmin = roles.includes('admin') || roles.includes('maintenance') || roles.includes('operator');
  const isMaintenanceOrAdmin = roles.includes('admin') || roles.includes('maintenance');

  // Load list of occurrences and active alarms
  const loadData = useCallback(async () => {
    try {
      const res = await getOcorrencias();
      setOcorrencias(res.data || []);
      // Filter active open alarms
      setActiveAlarms((res.data || []).filter(o => o.estado === 'ABERTA'));
    } catch (err) {
      console.error('Erro ao carregar lista de ocorrências:', err);
      toast.error(t('pages.ocorrencias.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto-refresh lists every 10 seconds
    const interval = setInterval(loadData, 10000);

    // Configurar WebSocket global
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-telemetry`;
    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        // Alertas de alteração/criação de ocorrências
        client.subscribe('/topic/alertas', () => {
          loadData();
        });
        // Alertas de escalamento
        client.subscribe('/topic/alertas-escalada', (message) => {
          if (message.body) {
            toast.warn(message.body, {
              position: "top-right",
              autoClose: 10000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
            });
          }
        });
      },
    });
    client.activate();

    return () => {
      clearInterval(interval);
      client.deactivate();
    };
  }, [loadData]);

  // Load single occurrence details if ID is present in URL
  useEffect(() => {
    if (id) {
      const fetchDetails = async () => {
        try {
          const [resDetail, resAnexos] = await Promise.all([
            getOcorrencia(id),
            getAnexos(id)
          ]);
          setSelectedOcorrencia(resDetail.data);
          setAttachments(resAnexos.data || []);
          // Reset child states
          setShowTelemetry(false);
          setTelemetryHistory([]);
          setCorrectiveAction(resDetail.data.acaoCorretiva || '');
          setActionNotes('');
        } catch (err) {
          console.error('Erro ao carregar detalhes da ocorrência:', err);
          toast.error(t('pages.ocorrencias.toasts.detailLoadFailed'));
          navigate('/backoffice/ocorrencias');
        }
      };
      fetchDetails();
    } else {
      setSelectedOcorrencia(null);
      setAttachments([]);
    }
  }, [id, navigate]);

  // Fetch associated driver and messages for the selected bus occurrence
  useEffect(() => {
    if (!selectedOcorrencia || selectedOcorrencia.tipoAtivo !== 'BUS') {
      setActiveDriver(null);
      setChatMessages([]);
      return;
    }

    const busCode = selectedOcorrencia.ativoId;

    // 1. Fetch associated driver
    const fetchDriver = async () => {
      setLoadingDriver(true);
      try {
        const res = await api.get('/drivers');
        const found = (res.data || []).find(d => d.currentBusCode === busCode);
        setActiveDriver(found || null);
      } catch (err) {
        console.warn('Erro ao obter motoristas:', err);
      } finally {
        setLoadingDriver(false);
      }
    };

    // 2. Fetch chat messages
    const fetchChatMessages = async () => {
      try {
        const res = await getMensagens(busCode);
        const sorted = (res.data || [])
          .slice(0, 50)
          .sort((a, b) => new Date(a.timestampEnvio) - new Date(b.timestampEnvio));
        setChatMessages(sorted);
      } catch (err) {
        console.warn('Erro ao obter mensagens do chat:', err);
      }
    };

    fetchDriver();
    fetchChatMessages();

    // Mark messages as read when opening details
    api.post(`/despacho/${busCode}/mensagens/marcar-lidas`).catch(() => { });

    // 3. Setup real-time WS subscription
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-telemetry`;
    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/mensagens/${busCode}`, () => {
          fetchChatMessages();
        });
      },
    });
    client.activate();

    return () => {
      client.deactivate();
    };
  }, [selectedOcorrencia]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatMessages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages.length]);

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!selectedOcorrencia || sendingChat) return;
    if (!chatInput.trim() || chatInput.length > 140) {
      setChatError("Mensagem inválida: o conteúdo não pode estar vazio e deve ter no máximo 140 caracteres");
      return;
    }
    setChatError('');
    setSendingChat(true);
    const busCode = selectedOcorrencia.ativoId;
    try {
      await enviarMensagem(busCode, chatInput.trim());
      setChatInput('');
      const res = await getMensagens(busCode);
      const sorted = (res.data || [])
        .slice(0, 50)
        .sort((a, b) => new Date(a.timestampEnvio) - new Date(b.timestampEnvio));
      setChatMessages(sorted);
    } catch (err) {
      toast.error('Erro ao enviar mensagem: ' + (err.response?.data?.message || err.message));
    } finally {
      setSendingChat(false);
    }
  };

  const handleRetryMessage = async (msg) => {
    if (!selectedOcorrencia || msg.estado !== 'FALHOU') return;
    const busCode = selectedOcorrencia.ativoId;
    try {
      await reenviarMensagem(busCode, msg.id);
      toast.success("Mensagem reenviada.");
      const res = await getMensagens(busCode);
      const sorted = (res.data || [])
        .slice(0, 50)
        .sort((a, b) => new Date(a.timestampEnvio) - new Date(b.timestampEnvio));
      setChatMessages(sorted);
    } catch (err) {
      toast.error("Erro ao reenviar mensagem: " + (err.response?.data?.message || err.message));
    }
  };

  const handleCancelMessage = async (msg) => {
    if (!selectedOcorrencia || msg.estado !== 'ENVIADA') return;
    const busCode = selectedOcorrencia.ativoId;
    try {
      await cancelarMensagem(busCode, msg.id);
      toast.success("Mensagem cancelada.");
      const res = await getMensagens(busCode);
      const sorted = (res.data || [])
        .slice(0, 50)
        .sort((a, b) => new Date(a.timestampEnvio) - new Date(b.timestampEnvio));
      setChatMessages(sorted);
    } catch (err) {
      toast.error("Erro ao cancelar mensagem: " + (err.response?.data?.message || err.message));
    }
  };

  // Toggle telemetry subflow chart
  const handleToggleTelemetry = async () => {
    if (!selectedOcorrencia) return;
    const nextState = !showTelemetry;
    setShowTelemetry(nextState);

    if (nextState && telemetryHistory.length === 0) {
      setLoadingTelemetry(true);
      try {
        const res = await getTelemetriaAtivo(selectedOcorrencia.ativoId);
        // Map timestamps to readable format for charting
        const mapped = (res.data || []).map(t => ({
          ...t,
          timeLabel: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })).reverse(); // Oldest first for line chart
        setTelemetryHistory(mapped);
      } catch (err) {
        console.error('Erro ao carregar telemetria histórica:', err);
        toast.error(t('pages.ocorrencias.toasts.telemetryFailed'));
      } finally {
        setLoadingTelemetry(false);
      }
    }
  };

  // Perform operational transition: Assume Occurrence
  const handleAssume = async () => {
    if (!selectedOcorrencia) return;
    try {
      const res = await assumirOcorrencia(selectedOcorrencia.id);
      setSelectedOcorrencia(res.data);
      toast.success(t('pages.ocorrencias.toasts.assumed'));
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(t('pages.ocorrencias.toasts.assumedFailed'));
    }
  };

  // Perform operational transition: Close as Resolved
  const handleCloseResolved = async () => {
    if (!selectedOcorrencia) return;
    if (!correctiveAction.trim()) {
      toast.warn(t('pages.ocorrencias.toasts.actionRequired'));
      return;
    }
    try {
      const body = {
        acaoCorretiva: correctiveAction,
        falsoPositivo: false
      };
      const res = await fecharOcorrencia(selectedOcorrencia.id, body);
      setSelectedOcorrencia(res.data);
      toast.success(t('pages.ocorrencias.toasts.closed'));
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(t('pages.ocorrencias.toasts.closedFailed'));
    }
  };

  // Perform operational transition: Mark as False Positive
  const handleMarkFalsePositive = async () => {
    if (!selectedOcorrencia) return;
    if (!actionNotes.trim()) {
      toast.warn(t('pages.ocorrencias.toasts.falsePositiveJustifRequired'));
      return;
    }
    try {
      const body = {
        justificacao: actionNotes,
        falsoPositivo: true
      };
      const res = await fecharOcorrencia(selectedOcorrencia.id, body);
      setSelectedOcorrencia(res.data);
      toast.success(t('pages.ocorrencias.toasts.falsePositiveClosed'));
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(t('pages.ocorrencias.toasts.falsePositiveFailed'));
    }
  };

  // Handle Drag & Drop / File Input uploads
  const handleFileUpload = async (file) => {
    if (!file) return;

    // Validations: 20MB limit
    const limit = 20 * 1024 * 1024;
    if (file.size > limit) {
      toast.error(t('pages.ocorrencias.toasts.attachTooBig'));
      return;
    }

    // Allowed types
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('pages.ocorrencias.toasts.attachBadType'));
      return;
    }

    setUploading(true);
    try {
      await uploadAnexo(selectedOcorrencia.id, file);
      toast.success(t('pages.ocorrencias.toasts.attachOk'));
      // Refresh attachments list
      const res = await getAnexos(selectedOcorrencia.id);
      setAttachments(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error(t('pages.ocorrencias.toasts.attachFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Apply filters
  const filteredOcorrencias = ocorrencias.filter(o => {
    const matchEstado = !estadoFilter || o.estado === estadoFilter;
    const matchAtivo = !ativoFilter || o.ativoId.toLowerCase().includes(ativoFilter.toLowerCase());
    return matchEstado && matchAtivo;
  });

  // Apply pagination
  const totalPages = Math.ceil(filteredOcorrencias.length / pageSize) || 1;
  const paginatedData = filteredOcorrencias.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Active occurrences for the "Ativos" tab: critical first, then oldest open first.
  const sortedActiveAlarms = [...activeAlarms].sort((a, b) => {
    const critA = a.prioridade === 'CRITICA' ? 0 : 1;
    const critB = b.prioridade === 'CRITICA' ? 0 : 1;
    if (critA !== critB) return critA - critB;
    return new Date(a.timestampAbertura) - new Date(b.timestampAbertura);
  });

  const formatTime = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('pt-PT');
  };

  const getElapsedTime = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <div className="ocorrencias-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>{t('pages.ocorrencias.pageTitle')}</h1>
          <p className="page-subtitle">{t('pages.ocorrencias.pageSubtitle')}</p>
        </div>
        {isSupervisorOrAdmin && (
          <button
            className="btn-action-primary"
            style={{ width: 'auto', padding: '10px 16px', background: '#3b82f6' }}
            onClick={() => setShowCreateModal(true)}
            id="btn-registar-ocorrencia"
          >
            + Registar Ocorrência
          </button>
        )}
      </div>

      {/* ─── ABAS: ATIVOS / HISTÓRICO ─── */}
      <div className="ocorrencias-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ativos'}
          className={`ocorrencias-tab ${activeTab === 'ativos' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('ativos')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
          {t('pages.ocorrencias.tabs.activeWithCount', { count: activeAlarms.length })}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'historico'}
          className={`ocorrencias-tab ${activeTab === 'historico' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('historico')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8v4l3 3" /><path d="M3.05 11a9 9 0 1 1 .5 4" /><path d="M3 4v4h4" /></svg>
          {t('pages.ocorrencias.tabs.history')}
        </button>
      </div>

      {loading ? (
        <p className="analytics-loading">{t('pages.ocorrencias.loading')}</p>
      ) : activeTab === 'ativos' ? (
        /* ─── TAB ATIVOS: ocorrências abertas, compacta e scrollável ─── */
        <section className="bus-card active-tab-card">
          <div className="active-tab-header">
            <span className="active-tab-count">{t('pages.ocorrencias.tabs.activeCount', { count: activeAlarms.length })}</span>
          </div>
          {sortedActiveAlarms.length === 0 ? (
            <p className="active-tab-empty">{t('pages.ocorrencias.tabs.activeEmpty')}</p>
          ) : (
            <div className="active-tab-scroll">
              <div className="active-alarms-grid">
                {sortedActiveAlarms.map(a => {
                  const tipo = (a.tipoAnomalia || '').toLowerCase();
                  const sevClass = tipo === 'fraude' ? 'fraud'
                    : tipo === 'acidente' ? 'critical'
                    : tipo === 'avaria' ? 'warning'
                    : 'info';
                  // Sprint 5 (follow-up): so' mostra prioridade quando NAO e' "normal"
                  // (default), para reduzir clutter. Estado "ABERTA" e' implicito
                  // nesta aba, por isso nao se mostra. Tipo de activo so' aparece
                  // se NAO for BUS (que ja' tem icone).
                  const showPriority = a.prioridade && a.prioridade.toLowerCase() !== 'normal';
                  const showAssetType = a.tipoAtivo && a.tipoAtivo.toLowerCase() !== 'bus';
                  return (
                    <div
                      key={a.id}
                      className={`active-alarm-card active-alarm-card--clickable active-alarm-card--${sevClass}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/backoffice/ocorrencias/${a.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/backoffice/ocorrencias/${a.id}`); } }}
                    >
                      <div className="alarm-card-bar" aria-hidden="true" />
                      <div className="alarm-card-body">
                        <div className="alarm-card-header">
                          <div className="alarm-card-id">
                            <span className="alarm-card-icon" aria-hidden="true">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                              </svg>
                            </span>
                            <span className="alarm-card-title">{a.tipoAnomalia}</span>
                            {a.reincidencia && (
                              <span
                                className="alarm-recurrent-dot"
                                title={t('pages.ocorrencias.recurrent', 'Recorrente')}
                                aria-label={t('pages.ocorrencias.recurrent', 'Recorrente')}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="23 4 23 10 17 10"/>
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                              </span>
                            )}
                          </div>
                          {showPriority && (
                            <span className={`alarm-badge-priority alarm-badge-priority--${a.prioridade.toLowerCase()}`}>
                              {a.prioridade}
                            </span>
                          )}
                        </div>
                        <div className="alarm-card-asset">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h20"/>
                            <path d="M7 18h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/>
                            <circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>
                          </svg>
                          <strong>{a.ativoId}</strong>
                          {showAssetType && <span className="alarm-card-asset-type">({a.tipoAtivo})</span>}
                        </div>
                        <div className="alarm-card-meta">
                          <span className="alarm-card-time">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                            <strong>{getElapsedTime(a.timestampAbertura)}</strong>
                          </span>
                          <button
                            className="btn-open-alarm"
                            onClick={(e) => { e.stopPropagation(); navigate(`/backoffice/ocorrencias/${a.id}`); }}
                          >
                            {t('pages.ocorrencias.tabs.openDetail')}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <line x1="5" y1="12" x2="19" y2="12"/>
                              <polyline points="12 5 19 12 12 19"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      ) : (
        /* ─── TAB HISTÓRICO: filtros + tabela completa + paginação ─── */
        <>
          {/* ─── FILTROS ─── */}
          <div className="table-filter-card">
            <div className="filter-item">
              <label>{t('pages.ocorrencias.filters.byState')}</label>
              <select value={estadoFilter} onChange={(e) => { setEstadoFilter(e.target.value); setCurrentPage(1); }}>
                <option value="">{t('pages.ocorrencias.filters.all')}</option>
                <option value="ABERTA">{t('pages.ocorrencias.states.aberta')}</option>
                <option value="EM_CURSO">{t('pages.ocorrencias.states.emCurso')}</option>
                <option value="RESOLVIDA">{t('pages.ocorrencias.states.resolvida')}</option>
                <option value="FALSO_POSITIVO">{t('pages.ocorrencias.states.falsoPositivo')}</option>
              </select>
            </div>

            <div className="filter-item">
              <label>{t('pages.ocorrencias.filters.byAsset')}</label>
              <input
                type="text"
                placeholder={t('pages.ocorrencias.search.busPlaceholder')}
                value={ativoFilter}
                onChange={(e) => { setAtivoFilter(e.target.value); setCurrentPage(1); }}
              />
            </div>

            {(estadoFilter || ativoFilter) && (
              <button
                className="btn-clear-filters"
                onClick={() => { setEstadoFilter(''); setAtivoFilter(''); setCurrentPage(1); }}
              >
                {t('pages.ocorrencias.filters.clear')}
              </button>
            )}
          </div>

          {/* ─── TABELA DE OCORRÊNCIAS ─── */}
          <section className="bus-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="ocorrencias-table-wrap" style={{ maxHeight: 'none' }}>
              <table className="ocorrencias-table">
                <thead>
                  <tr>
                    <th>{t('pages.ocorrencias.headers.id')}</th>
                    <th>{t('pages.ocorrencias.headers.asset')}</th>
                    <th>{t('pages.ocorrencias.headers.anomalyType')}</th>
                    <th>{t('pages.ocorrencias.headers.priority')}</th>
                    <th>{t('pages.ocorrencias.headers.state')}</th>
                    <th>{t('pages.ocorrencias.headers.openedAt')}</th>
                    <th>{t('pages.ocorrencias.headers.responsible')}</th>
                    <th>{t('pages.ocorrencias.headers.notes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="dash-empty">{t('pages.ocorrencias.emptyTable')}</td>
                    </tr>
                  ) : (
                    paginatedData.map(o => (
                      <tr
                        key={o.id}
                        className="table-row-clickable"
                        onClick={() => navigate(`/backoffice/ocorrencias/${o.id}`)}
                      >
                        <td style={{ fontWeight: 700 }}>#{o.id}</td>
                        <td>{o.ativoId} <span style={{ fontSize: '10px', color: '#94a3b8' }}>({o.tipoAtivo})</span></td>
                        <td style={{ fontWeight: 600 }}>{o.tipoAnomalia}</td>
                        <td>
                          <span className={`priority--${o.prioridade.toLowerCase()}`}>
                            {o.prioridade}
                          </span>
                        </td>
                        <td>
                          <span className={`ocorrencia-badge-state state--${o.estado.toLowerCase()}`}>
                            {o.estado.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="ocorrencias-time">{formatTime(o.timestampAbertura)}</td>
                        <td>{o.responsavel || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{t('pages.ocorrencias.unassigned')}</span>}</td>
                        <td>
                          {o.reincidencia && (
                            <span style={{ background: '#ffedd5', color: '#ea580c', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
                              {t('pages.ocorrencias.recurrent')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="pagination-container" style={{ padding: '16px 22px', borderTop: '1px solid var(--color-border-light)' }}>
              <span className="pagination-info">
                {t('pages.ocorrencias.pagination.showing', { shown: paginatedData.length, total: filteredOcorrencias.length })}
              </span>
              <div className="pagination-actions">
                <button
                  className="btn-page"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                >
                  {t('pages.ocorrencias.pagination.previous')}
                </button>
                <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '13px', padding: '0 8px', fontWeight: 600 }}>
                  {t('pages.ocorrencias.pagination.pageOf', { current: currentPage, total: totalPages })}
                </span>
                <button
                  className="btn-page"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                >
                  {t('pages.ocorrencias.pagination.next')}
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ─── GLASSMORPHISM DETAIL SLIDE-OUT OVERLAY ─── */}
      {selectedOcorrencia && (
        <div className="glass-modal-overlay" onClick={() => navigate('/backoffice/ocorrencias')}>
          <div className="glass-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h2>{t('pages.ocorrencias.detail.headerPrefix')} #{selectedOcorrencia.id}</h2>
              <button className="btn-close-panel" onClick={() => navigate('/backoffice/ocorrencias')}>×</button>
            </div>

            <div className="panel-body">
              {/* Grid de Informações Básicas */}
              <div className="panel-grid">
                <div className="panel-info-card">
                  <span className="panel-info-label">{t('pages.ocorrencias.detail.assetLabel')}</span>
                  <span className="panel-info-value">{selectedOcorrencia.ativoId} ({selectedOcorrencia.tipoAtivo})</span>
                </div>
                <div className="panel-info-card">
                  <span className="panel-info-label">{t('pages.ocorrencias.detail.anomalyTypeLabel')}</span>
                  <span className="panel-info-value">{selectedOcorrencia.tipoAnomalia}</span>
                </div>
                <div className="panel-info-card">
                  <span className="panel-info-label">{t('pages.ocorrencias.detail.priorityLabel')}</span>
                  <span className={`panel-info-value priority--${selectedOcorrencia.prioridade.toLowerCase()}`}>
                    {selectedOcorrencia.prioridade}
                  </span>
                </div>
                <div className="panel-info-card">
                  <span className="panel-info-label">{t('pages.ocorrencias.detail.stateLabel')}</span>
                  <span className="panel-info-value">
                    <span className={`ocorrencia-badge-state state--${selectedOcorrencia.estado.toLowerCase()}`}>
                      {selectedOcorrencia.estado.replace('_', ' ')}
                    </span>
                  </span>
                </div>
              </div>

              {/* Descrição */}
              {selectedOcorrencia.descricao && (
                <div className="panel-info-card" style={{ display: 'block', width: '100%' }}>
                  <span className="panel-info-label">{t('pages.ocorrencias.detail.descriptionLabel')}</span>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text)', lineHeight: 1.5 }}>
                    {selectedOcorrencia.descricao}
                  </p>
                </div>
              )}

              {/* Secção de Comunicação com o Motorista */}
              {selectedOcorrencia.tipoAtivo === 'BUS' && (
                <div className="ocorrencia-chat-section">
                  <span className="panel-info-label">Comunicação com o Motorista</span>
                  {loadingDriver ? (
                    <p className="chat-loading-text">A verificar motorista ativo...</p>
                  ) : activeDriver ? (
                    <div className="ocorrencia-chat-box">
                      <div className="chat-header-driver">
                        <span className="driver-avatar-circle">
                          {activeDriver.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="driver-header-info">
                          <strong>{activeDriver.name}</strong>
                          <span className="driver-subtext">Nº Mec: {activeDriver.mechanographicNumber}</span>
                        </div>
                      </div>

                      <div className="ocorrencia-chat-list">
                        {chatMessages.length === 0 ? (
                          <div className="ocorrencia-chat-empty">Sem mensagens. Envie a primeira mensagem para iniciar o contacto.</div>
                        ) : (
                          chatMessages.map(msg => {
                            const fromDriver = isMsgFromDriver(msg);
                            return (
                              <div key={msg.id} className={`ocorrencia-msg ${fromDriver ? 'msg--driver' : 'msg--operator'}`}>
                                <div className="ocorrencia-msg-content">{msg.conteudo}</div>
                                <div className="ocorrencia-msg-meta">
                                  <span>{new Date(msg.timestampEnvio).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                                  {!fromDriver && (
                                    <div className="ocorrencia-msg-state-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginLeft: '6px' }}>
                                      <span className={`ocorrencia-msg-state msg-state--${msg.estado?.toLowerCase()}`}>
                                        {msg.estado === 'LIDA' && '✓✓ Lida'}
                                        {msg.estado === 'ENTREGUE' && '✓✓ Entregue'}
                                        {msg.estado === 'ENVIADA' && '✓ Enviada'}
                                        {msg.estado === 'FALHOU' && '! Falhou'}
                                        {msg.estado === 'CANCELADA' && '⚪ Cancelada'}
                                      </span>
                                      {msg.estado === 'FALHOU' && (
                                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                                          <button
                                            type="button"
                                            onClick={() => handleRetryMessage(msg)}
                                            style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '3px', fontSize: '9px', padding: '2px 4px', cursor: 'pointer' }}
                                          >
                                            Reenviar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleCancelMessage(msg)}
                                            style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', fontSize: '9px', padding: '2px 4px', cursor: 'pointer' }}
                                          >
                                            Cancelar
                                          </button>
                                        </div>
                                      )}
                                      {msg.estado === 'ENVIADA' && (
                                        <button
                                          type="button"
                                          onClick={() => handleCancelMessage(msg)}
                                          style={{ background: '#64748b', color: 'white', border: 'none', borderRadius: '3px', fontSize: '9px', padding: '2px 4px', cursor: 'pointer' }}
                                        >
                                          Cancelar
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      <form className="ocorrencia-chat-form" onSubmit={handleSendChat}>
                        <input
                          type="text"
                          placeholder={`Mensagem para ${activeDriver.name.split(' ')[0]}...`}
                          value={chatInput}
                          onChange={(e) => {
                            setChatInput(e.target.value);
                            if (chatError) setChatError('');
                          }}
                          maxLength={140}
                          disabled={sendingChat}
                          style={chatError ? { borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' } : {}}
                        />
                        <button type="submit" disabled={sendingChat}>
                          {sendingChat ? '...' : 'Enviar'}
                        </button>
                      </form>
                      {chatError && (
                        <div className="chat-error-message" style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px', textAlign: 'left' }}>
                          {chatError}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="chat-no-driver">
                      ⚠️ Nenhum motorista está em serviço neste autocarro no momento.
                    </div>
                  )}
                </div>
              )}

              {/* Subflow - Telemetria Histórica 24h */}
              <div>
                <button className="btn-action-outline" onClick={handleToggleTelemetry} style={{ width: '100%' }}>
                  {showTelemetry ? t('pages.ocorrencias.telemetry.hide') : t('pages.ocorrencias.telemetry.show')}
                </button>
                {showTelemetry && (
                  <div className="telemetria-panel">
                    <div className="telemetria-panel-header">
                      <h5>{t('pages.ocorrencias.telemetry.historyTitle')}</h5>
                    </div>
                    {loadingTelemetry ? (
                      <p style={{ fontSize: '12px', color: '#64748b' }}>{t('pages.ocorrencias.telemetry.fetching')}</p>
                    ) : telemetryHistory.length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{t('pages.ocorrencias.telemetry.empty')}</p>
                    ) : (
                      <div style={{ width: '100%', height: 260, marginTop: '10px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={telemetryHistory} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="timeLabel" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                            <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="temperaturaMotor" name={t('pages.ocorrencias.chart.temp')} stroke="#ef4444" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="speed" name={t('pages.ocorrencias.chart.speed')} stroke="#f59e0b" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="nivelBateria" name={t('pages.ocorrencias.chart.battery')} stroke="#10b981" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Snapshot no Momento do Alarme */}
              {selectedOcorrencia.telemetriaSnapshot && (
                <div className="snapshot-section">
                  <span className="panel-info-label">{t('pages.ocorrencias.detail.snapshotLabel')}</span>
                  <pre className="snapshot-box">
                    {JSON.stringify(selectedOcorrencia.telemetriaSnapshot, null, 2)}
                  </pre>
                </div>
              )}

              {/* Timeline de Eventos */}
              <div className="timeline-section">
                <span className="panel-info-label" style={{ marginBottom: '10px', display: 'block' }}>{t('pages.ocorrencias.timeline.title')}</span>
                <div className="timeline">
                  <div className="timeline-item">
                    <div className="timeline-dot active"></div>
                    <div className="timeline-content">
                      <span className="timeline-title">{t('pages.ocorrencias.timeline.created')}</span>
                      <span className="timeline-time">{formatTime(selectedOcorrencia.timestampAbertura)}</span>
                      {selectedOcorrencia.criadoPor && (
                        <span className="timeline-desc">{t('pages.ocorrencias.timeline.createdAutoBy', { actor: selectedOcorrencia.criadoPor })}</span>
                      )}
                    </div>
                  </div>

                  {selectedOcorrencia.timestampAssumida && (
                    <div className="timeline-item">
                      <div className="timeline-dot active"></div>
                      <div className="timeline-content">
                        <span className="timeline-title">{t('pages.ocorrencias.timeline.assumed')}</span>
                        <span className="timeline-time">{formatTime(selectedOcorrencia.timestampAssumida)}</span>
                        <span className="timeline-desc">{t('pages.ocorrencias.timeline.responsibleLabel')}: <strong>{selectedOcorrencia.responsavel}</strong></span>
                      </div>
                    </div>
                  )}

                  {selectedOcorrencia.timestampFecho && (
                    <div className="timeline-item">
                      <div className="timeline-dot active" style={{ background: '#10b981', boxShadow: '0 0 0 2px #10b981' }}></div>
                      <div className="timeline-content">
                        <span className="timeline-title">
                          {t('pages.ocorrencias.timeline.closed', { state: selectedOcorrencia.estado.replace('_', ' ') })}
                        </span>
                        <span className="timeline-time">{formatTime(selectedOcorrencia.timestampFecho)}</span>
                        {selectedOcorrencia.estado === 'RESOLVIDA' ? (
                          <span className="timeline-desc" style={{ borderLeftColor: '#10b981' }}>
                            {t('pages.ocorrencias.detail.correctiveAction')}: {selectedOcorrencia.acaoCorretiva || t('pages.ocorrencias.detail.noInfo')}
                          </span>
                        ) : (
                          <span className="timeline-desc" style={{ borderLeftColor: '#64748b' }}>
                            {t('pages.ocorrencias.detail.falsePositiveReason')}: {selectedOcorrencia.falsoPositivoJustificacao || t('pages.ocorrencias.detail.noInfo')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Secção de Ações Contextuais */}
              {isSupervisorOrAdmin && (selectedOcorrencia.estado === 'ABERTA' || selectedOcorrencia.estado === 'EM_CURSO') && (
                <div className="action-section" style={{ marginBottom: '16px' }}>
                  <h4>{selectedOcorrencia.responsavel ? "Reatribuir Técnico" : "Atribuir Técnico"}</h4>
                  <div className="form-group" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      value={selectedOcorrencia.responsavel || ''}
                      onChange={async (e) => {
                        const targetUser = e.target.value;
                        if (!targetUser) return;
                        try {
                          const res = await atribuirOcorrencia(selectedOcorrencia.id, targetUser);
                          setSelectedOcorrencia(res.data);
                          toast.success("Ocorrência atribuída com sucesso!");
                          loadData();
                        } catch (err) {
                          console.error(err);
                          toast.error("Erro ao atribuir ocorrência: " + (err.response?.data?.message || err.message));
                        }
                      }}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', color: '#1e293b' }}
                    >
                      <option value="">-- Selecione um técnico --</option>
                      {technicians.map(u => (
                        <option key={u.id} value={u.username}>
                          {u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : u.username} ({u.username})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {isMaintenanceOrAdmin && selectedOcorrencia.estado === 'ABERTA' && (
                <div className="action-section">
                  <h4>{t('pages.ocorrencias.actions.availableTitle')}</h4>
                  <button className="btn-action-primary" style={{ width: '100%' }} onClick={handleAssume}>
                    {t('pages.ocorrencias.actions.assumeButton')}
                  </button>
                </div>
              )}

              {isMaintenanceOrAdmin && selectedOcorrencia.estado === 'EM_CURSO' && (
                <div className="action-section">
                  <h4>{t('pages.ocorrencias.actions.resolutionTitle')}</h4>
                  <div className="action-form">
                    <div className="form-group">
                      <label>{t('pages.ocorrencias.actions.correctiveLabel')}</label>
                      <textarea
                        placeholder={t('pages.ocorrencias.detail.descriptionPlaceholder')}
                        value={correctiveAction}
                        onChange={(e) => {
                          setCorrectiveAction(e.target.value);
                          setActionNotes(e.target.value); // fallback
                        }}
                      />
                    </div>
                    <div className="action-row">
                      <button
                        className="btn-action-primary"
                        style={{ flex: 1, background: '#10b981' }}
                        onClick={handleCloseResolved}
                      >
                        {t('pages.ocorrencias.actions.closeResolved')}
                      </button>
                      <button
                        className="btn-action-outline"
                        style={{ flex: 1, color: '#ef4444', borderColor: '#fca5a5' }}
                        onClick={handleMarkFalsePositive}
                      >
                        {t('pages.ocorrencias.actions.falsePositive')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Secção de Anexos */}
              <div className="attachments-section">
                <span className="panel-info-label" style={{ marginBottom: '10px', display: 'block' }}>{t('pages.ocorrencias.attach.sectionLabel')}</span>

                {/* Drag and Drop Zone */}
                {selectedOcorrencia.estado !== 'RESOLVIDA' && selectedOcorrencia.estado !== 'FALSO_POSITIVO' && (
                  <div
                    className="dropzone-container"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    <input
                      type="file"
                      id="anexoFile"
                      style={{ display: 'none' }}
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={(e) => handleFileUpload(e.target.files[0])}
                      disabled={uploading}
                    />
                    <label htmlFor="anexoFile" className="dropzone-label">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span>
                        {uploading ? t('pages.ocorrencias.attach.uploading') : t('pages.ocorrencias.attach.dropHint')}
                      </span>
                    </label>
                  </div>
                )}

                {/* Attachments List */}
                <div className="attachment-list">
                  {attachments.length === 0 ? (
                    <p style={{ fontStyle: 'italic', color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>{t('pages.ocorrencias.attach.noAttachments')}</p>
                  ) : (
                    attachments.map(anexo => (
                      <div key={anexo.id} className="attachment-item">
                        <div className="attachment-info">
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.7 }}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                          <span>{anexo.nomeFicheiro}</span>
                          <span className="attachment-size">({(anexo.tamanhoBytes / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                        <a
                          href={`/api/v1/ocorrencias/anexos/${anexo.id}`} // Se houver endpoint de download
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#009BDB', textDecoration: 'none', fontWeight: 600 }}
                        >
                          {t('pages.ocorrencias.attach.view')}
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Modal para registar nova ocorrência manualmente */}
      {showCreateModal && (
        <div className="glass-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="glass-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="panel-header">
              <h2>Registar Nova Ocorrência (UC6)</h2>
              <button className="btn-close-panel" onClick={() => setShowCreateModal(false)}>×</button>
            </div>

            <form onSubmit={handleCreateOccurrence} className="panel-body form-create-ocorrencia" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Código/ID do Ativo</label>
                <input
                  type="text"
                  placeholder="Ex: TUB-42 ou Posto_Carga_01"
                  value={newAtivoId}
                  onChange={(e) => setNewAtivoId(e.target.value)}
                  required
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Tipo de Ativo</label>
                <select
                  value={newTipoAtivo}
                  onChange={(e) => setNewTipoAtivo(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}
                >
                  <option value="BUS">Autocarro (BUS)</option>
                  <option value="CHARGER">Carregador (CHARGER)</option>
                </select>
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Tipo de Anomalia</label>
                <select
                  value={newTipoAnomalia}
                  onChange={(e) => setNewTipoAnomalia(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}
                >
                  <option value="SOBREAQUECIMENTO">SOBREAQUECIMENTO</option>
                  <option value="FALHA_CARREGADOR">FALHA_CARREGADOR</option>
                  <option value="BATERIA_CRITICA">BATERIA_CRITICA</option>
                  <option value="PROBLEMA_PASSAGEIRO">PROBLEMA_PASSAGEIRO</option>
                  <option value="AVARIA_MECANICA">AVARIA_MECANICA</option>
                  <option value="DESVIO_ROTA">DESVIO_ROTA</option>
                </select>
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Prioridade</label>
                <select
                  value={newPrioridade}
                  onChange={(e) => setNewPrioridade(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}
                >
                  <option value="NORMAL">NORMAL</option>
                  <option value="CRITICA">CRÍTICA</option>
                </select>
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Descrição Detalhada</label>
                <textarea
                  placeholder="Descreva a anomalia observada..."
                  value={newDescricao}
                  onChange={(e) => setNewDescricao(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', minHeight: '80px' }}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Notas Iniciais</label>
                <input
                  type="text"
                  placeholder="Ex: Alerta recebido via chamada"
                  value={newNotasIniciais}
                  onChange={(e) => setNewNotasIniciais(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div className="action-row" style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="submit"
                  className="btn-action-primary"
                  style={{ flex: 1, background: '#3b82f6', width: 'auto' }}
                  disabled={submittingCreate}
                >
                  {submittingCreate ? 'A registar...' : 'Confirmar e Registar'}
                </button>
                <button
                  type="button"
                  className="btn-action-outline"
                  style={{ flex: 1 }}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
