import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  getOcorrencias,
  getOcorrencia,
  assumirOcorrencia,
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
  const { id } = useParams();
  const navigate = useNavigate();
  const { username, roles } = useAuth();

  // General state
  const [ocorrencias, setOcorrencias] = useState([]);
  const [activeAlarms, setActiveAlarms] = useState([]);
  const [loading, setLoading] = useState(true);

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
      toast.error('Erro ao carregar lista de ocorrências.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto-refresh lists every 10 seconds
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
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
          toast.error('Ocorrência não encontrada ou erro de permissão.');
          navigate('/backoffice/ocorrencias');
        }
      };
      fetchDetails();
    } else {
      setSelectedOcorrencia(null);
      setAttachments([]);
    }
  }, [id, navigate]);

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
        toast.error('Erro ao obter telemetria nas últimas 24h.');
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
      toast.success('Assumiu a responsabilidade por esta ocorrência.');
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao assumir ocorrência.');
    }
  };

  // Perform operational transition: Close as Resolved
  const handleCloseResolved = async () => {
    if (!selectedOcorrencia) return;
    if (!correctiveAction.trim()) {
      toast.warn('Por favor, indique a ação corretiva aplicada.');
      return;
    }
    try {
      const body = {
        acaoCorretiva: correctiveAction,
        falsoPositivo: false
      };
      const res = await fecharOcorrencia(selectedOcorrencia.id, body);
      setSelectedOcorrencia(res.data);
      toast.success('Ocorrência resolvida e fechada com sucesso.');
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao fechar ocorrência.');
    }
  };

  // Perform operational transition: Mark as False Positive
  const handleMarkFalsePositive = async () => {
    if (!selectedOcorrencia) return;
    if (!actionNotes.trim()) {
      toast.warn('Por favor, indique a justificação para marcar como falso positivo.');
      return;
    }
    try {
      const body = {
        justificacao: actionNotes,
        falsoPositivo: true
      };
      const res = await fecharOcorrencia(selectedOcorrencia.id, body);
      setSelectedOcorrencia(res.data);
      toast.success('Ocorrência fechada como Falso Positivo.');
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao registar falso positivo.');
    }
  };

  // Handle Drag & Drop / File Input uploads
  const handleFileUpload = async (file) => {
    if (!file) return;
    
    // Validations: 20MB limit
    const limit = 20 * 1024 * 1024;
    if (file.size > limit) {
      toast.error('O ficheiro excede o tamanho máximo permitido de 20 MB.');
      return;
    }

    // Allowed types
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Formato de ficheiro não suportado. Formatos permitidos: JPG, PNG, PDF.');
      return;
    }

    setUploading(true);
    try {
      await uploadAnexo(selectedOcorrencia.id, file);
      toast.success('Anexo enviado com sucesso.');
      // Refresh attachments list
      const res = await getAnexos(selectedOcorrencia.id);
      setAttachments(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar anexo.');
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
      <div className="page-header">
        <div>
          <h1>Gestão de Ocorrências</h1>
          <p className="page-subtitle">Monitore anomalias de sensores e atue em tempo real</p>
        </div>
      </div>

      {/* ─── PAINEL DE ALARMES ATIVOS (Sempre visível no topo) ─── */}
      <section className="active-alarms-panel">
        <div className="active-alarms-header">
          <h2>
            <span>🚨</span> Alarmes Ativos ({activeAlarms.length})
          </h2>
        </div>
        {activeAlarms.length === 0 ? (
          <p style={{ color: '#cbd5e1', fontSize: '13px', margin: 0 }}>Sem alarmes ativos em aberto de momento.</p>
        ) : (
          <div className="active-alarms-grid">
            {activeAlarms.map(a => (
              <div key={a.id} className="active-alarm-card">
                <div className="alarm-card-header">
                  <div>
                    <span className="alarm-card-title">{a.tipoAnomalia}</span>
                    <div className="alarm-card-subtitle">Ativo: {a.ativoId} ({a.tipoAtivo})</div>
                  </div>
                  <span className={`alarm-badge-priority alarm-badge-priority--${a.prioridade.toLowerCase()}`}>
                    {a.prioridade}
                  </span>
                </div>
                <div className="alarm-card-meta">
                  <span>Aberto há: <strong>{getElapsedTime(a.timestampAbertura)}</strong></span>
                  <button className="btn-open-alarm" onClick={() => navigate(`/backoffice/ocorrencias/${a.id}`)}>
                    Abrir Detalhe
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── FILTROS ─── */}
      <div className="table-filter-card">
        <div className="filter-item">
          <label>Filtro por Estado</label>
          <select value={estadoFilter} onChange={(e) => { setEstadoFilter(e.target.value); setCurrentPage(1); }}>
            <option value="">Todos</option>
            <option value="ABERTA">Aberta</option>
            <option value="EM_CURSO">Em Curso</option>
            <option value="RESOLVIDA">Resolvida</option>
            <option value="FALSO_POSITIVO">Falso Positivo</option>
          </select>
        </div>

        <div className="filter-item">
          <label>Filtro por Ativo</label>
          <input
            type="text"
            placeholder="Ex: BUS_01"
            value={ativoFilter}
            onChange={(e) => { setAtivoFilter(e.target.value); setCurrentPage(1); }}
          />
        </div>

        {(estadoFilter || ativoFilter) && (
          <button
            className="btn-clear-filters"
            onClick={() => { setEstadoFilter(''); setAtivoFilter(''); setCurrentPage(1); }}
          >
            Limpar Filtros
          </button>
        )}
      </div>

      {/* ─── TABELA DE OCORRÊNCIAS ─── */}
      {loading ? (
        <p className="analytics-loading">A carregar ocorrências...</p>
      ) : (
        <section className="bus-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="congestion-table-wrap" style={{ maxHeight: 'none' }}>
            <table className="congestion-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Ativo</th>
                  <th>Tipo Anomalia</th>
                  <th>Prioridade</th>
                  <th>Estado</th>
                  <th>Timestamp Abertura</th>
                  <th>Responsável</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="dash-empty">Nenhuma ocorrência encontrada para os filtros indicados.</td>
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
                      <td className="congestion-time">{formatTime(o.timestampAbertura)}</td>
                      <td>{o.responsavel || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Não atribuído</span>}</td>
                      <td>
                        {o.reincidencia && (
                          <span style={{ background: '#ffedd5', color: '#ea580c', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
                            Reincidente
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
              A mostrar {paginatedData.length} de {filteredOcorrencias.length} ocorrências
            </span>
            <div className="pagination-actions">
              <button
                className="btn-page"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              >
                Anterior
              </button>
              <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '13px', padding: '0 8px', fontWeight: 600 }}>
                Página {currentPage} de {totalPages}
              </span>
              <button
                className="btn-page"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              >
                Seguinte
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ─── GLASSMORPHISM DETAIL SLIDE-OUT OVERLAY ─── */}
      {selectedOcorrencia && (
        <div className="glass-modal-overlay" onClick={() => navigate('/backoffice/ocorrencias')}>
          <div className="glass-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h2>Ocorrência #{selectedOcorrencia.id}</h2>
              <button className="btn-close-panel" onClick={() => navigate('/backoffice/ocorrencias')}>×</button>
            </div>

            <div className="panel-body">
              {/* Grid de Informações Básicas */}
              <div className="panel-grid">
                <div className="panel-info-card">
                  <span className="panel-info-label">Ativo</span>
                  <span className="panel-info-value">{selectedOcorrencia.ativoId} ({selectedOcorrencia.tipoAtivo})</span>
                </div>
                <div className="panel-info-card">
                  <span className="panel-info-label">Tipo Anomalia</span>
                  <span className="panel-info-value">{selectedOcorrencia.tipoAnomalia}</span>
                </div>
                <div className="panel-info-card">
                  <span className="panel-info-label">Prioridade</span>
                  <span className={`panel-info-value priority--${selectedOcorrencia.prioridade.toLowerCase()}`}>
                    {selectedOcorrencia.prioridade}
                  </span>
                </div>
                <div className="panel-info-card">
                  <span className="panel-info-label">Estado</span>
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
                  <span className="panel-info-label">Descrição</span>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                    {selectedOcorrencia.descricao}
                  </p>
                </div>
              )}

              {/* Subflow - Telemetria Histórica 24h */}
              <div>
                <button className="btn-action-outline" onClick={handleToggleTelemetry} style={{ width: '100%' }}>
                  {showTelemetry ? 'Esconder Telemetria Histórica' : '🔍 Ver Telemetria (Últimas 24h)'}
                </button>
                {showTelemetry && (
                  <div className="telemetria-panel">
                    <div className="telemetria-panel-header">
                      <h5>Histórico de Sensores (Últimas 24h)</h5>
                    </div>
                    {loadingTelemetry ? (
                      <p style={{ fontSize: '12px', color: '#64748b' }}>A obter dados...</p>
                    ) : telemetryHistory.length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Sem dados de telemetria nas últimas 24h.</p>
                    ) : (
                      <div style={{ width: '100%', height: 260, marginTop: '10px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={telemetryHistory} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="timeLabel" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                            <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="temperaturaMotor" name="Temp (°C)" stroke="#ef4444" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="speed" name="Vel (km/h)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="nivelBateria" name="Bateria (%)" stroke="#10b981" strokeWidth={2} dot={false} />
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
                  <span className="panel-info-label">Snapshot de Telemetria</span>
                  <pre className="snapshot-box">
                    {JSON.stringify(selectedOcorrencia.telemetriaSnapshot, null, 2)}
                  </pre>
                </div>
              )}

              {/* Timeline de Eventos */}
              <div className="timeline-section">
                <span className="panel-info-label" style={{ marginBottom: '10px', display: 'block' }}>Linha Temporal de Eventos</span>
                <div className="timeline">
                  <div className="timeline-item">
                    <div className="timeline-dot active"></div>
                    <div className="timeline-content">
                      <span className="timeline-title">Ocorrência Criada</span>
                      <span className="timeline-time">{formatTime(selectedOcorrencia.timestampAbertura)}</span>
                      {selectedOcorrencia.criadoPor && (
                        <span className="timeline-desc">Criada automaticamente pelo {selectedOcorrencia.criadoPor}</span>
                      )}
                    </div>
                  </div>

                  {selectedOcorrencia.timestampAssumida && (
                    <div className="timeline-item">
                      <div className="timeline-dot active"></div>
                      <div className="timeline-content">
                        <span className="timeline-title">Assumida pelo Técnico</span>
                        <span className="timeline-time">{formatTime(selectedOcorrencia.timestampAssumida)}</span>
                        <span className="timeline-desc">Responsável: <strong>{selectedOcorrencia.responsavel}</strong></span>
                      </div>
                    </div>
                  )}

                  {selectedOcorrencia.timestampFecho && (
                    <div className="timeline-item">
                      <div className="timeline-dot active" style={{ background: '#10b981', boxShadow: '0 0 0 2px #10b981' }}></div>
                      <div className="timeline-content">
                        <span className="timeline-title">
                          Ocorrência Fechada ({selectedOcorrencia.estado.replace('_', ' ')})
                        </span>
                        <span className="timeline-time">{formatTime(selectedOcorrencia.timestampFecho)}</span>
                        {selectedOcorrencia.estado === 'RESOLVIDA' ? (
                          <span className="timeline-desc" style={{ borderLeftColor: '#10b981' }}>
                            Ação Corretiva: {selectedOcorrencia.acaoCorretiva || 'Sem informação'}
                          </span>
                        ) : (
                          <span className="timeline-desc" style={{ borderLeftColor: '#64748b' }}>
                            Justificação: {selectedOcorrencia.falsoPositivoJustificacao || 'Sem informação'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Secção de Ações Contextuais */}
              {isMaintenanceOrAdmin && selectedOcorrencia.estado === 'ABERTA' && (
                <div className="action-section">
                  <h4>Ações Disponíveis</h4>
                  <button className="btn-action-primary" style={{ width: '100%' }} onClick={handleAssume}>
                    🤝 Assumir Ocorrência
                  </button>
                </div>
              )}

              {isMaintenanceOrAdmin && selectedOcorrencia.estado === 'EM_CURSO' && (
                <div className="action-section">
                  <h4>Registo de Resolução</h4>
                  <div className="action-form">
                    <div className="form-group">
                      <label>Ação Corretiva Aplicada / Notas</label>
                      <textarea
                        placeholder="Descreva a ação de intervenção aplicada ou a justificação em caso de falso positivo..."
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
                        ✓ Fechar como Resolvida
                      </button>
                      <button
                        className="btn-action-outline"
                        style={{ flex: 1, color: '#ef4444', borderColor: '#fca5a5' }}
                        onClick={handleMarkFalsePositive}
                      >
                        ✗ Falso Positivo
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Secção de Anexos */}
              <div className="attachments-section">
                <span className="panel-info-label" style={{ marginBottom: '10px', display: 'block' }}>Anexos de Suporte (Máx 20MB - JPG/PNG/PDF)</span>
                
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
                        {uploading ? 'A enviar anexo...' : 'Arraste um ficheiro ou clique para selecionar'}
                      </span>
                    </label>
                  </div>
                )}

                {/* Attachments List */}
                <div className="attachment-list">
                  {attachments.length === 0 ? (
                    <p style={{ fontStyle: 'italic', color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>Sem anexos associados.</p>
                  ) : (
                    attachments.map(anexo => (
                      <div key={anexo.id} className="attachment-item">
                        <div className="attachment-info">
                          <span>📎</span>
                          <span>{anexo.nomeFicheiro}</span>
                          <span className="attachment-size">({(anexo.tamanhoBytes / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                        <a
                          href={`/api/v1/ocorrencias/anexos/${anexo.id}`} // Se houver endpoint de download
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}
                        >
                          Ver
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
    </div>
  );
}
