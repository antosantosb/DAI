import { useState, useEffect, useCallback } from 'react';
import { enviarMensagem, reenviarMensagem, cancelarMensagem, getMensagens } from '../../services/despachoApi';

export default function MessagePanel({ bus, isOnline, onClose, subscribeToMessages }) {
  const [content, setContent] = useState('');
  const [history, setHistory] = useState([]);
  const [activeMsg, setActiveMsg] = useState(null); // { id, state, timestampEnvio, ... }
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await getMensagens(bus.busId);
      setHistory(res.data || []);
      
      // Se houver uma mensagem ativa recente no estado ENVIADA, manter controlo
      const active = (res.data || []).find(m => m.estado === 'ENVIADA');
      if (active) {
        setActiveMsg(active);
      }
    } catch (err) {
      console.error('Erro ao carregar histórico de mensagens', err);
    }
  }, [bus.busId]);

  // Load history on mount or when bus changes
  useEffect(() => {
    fetchHistory();
    setContent('');
    setActiveMsg(null);
    setErrorMsg(null);
    setValidationError(null);
  }, [bus.busId, fetchHistory]);

  // WebSocket status subscription
  useEffect(() => {
    if (!subscribeToMessages) return;
    
    const sub = subscribeToMessages(bus.busId, (update) => {
      // Se for a mensagem activa atualizada, ou se a mensagem no histórico mudou
      setActiveMsg(prev => {
        if (prev && prev.mqttMessageId === update.mqttMessageId) {
          return { ...prev, estado: update.estado, erroDetalhe: update.erroDetalhe };
        }
        return prev;
      });
      // Atualizar lista completa do histórico
      fetchHistory();
    });

    return () => {
      if (sub) sub.unsubscribe();
    };
  }, [bus.busId, subscribeToMessages, fetchHistory]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!isOnline) return;

    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 140) {
      setValidationError("Mensagem inválida: o conteúdo não pode estar vazio e deve ter no máximo 140 caracteres");
      return;
    }

    setValidationError(null);
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await enviarMensagem(bus.busId, content);
      setActiveMsg(res.data);
      setContent('');
      fetchHistory();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Falha ao ligar ao serviço de despacho.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!activeMsg || activeMsg.estado !== 'FALHOU') return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await reenviarMensagem(bus.busId, activeMsg.id);
      setActiveMsg(res.data);
      fetchHistory();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Falha ao reenviar mensagem.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!activeMsg || activeMsg.estado !== 'ENVIADA') return;
    try {
      await cancelarMensagem(bus.busId, activeMsg.id);
      setActiveMsg(prev => ({ ...prev, estado: 'CANCELADA' }));
      fetchHistory();
    } catch (err) {
      setErrorMsg('Falha ao cancelar mensagem.');
    }
  };

  const handleCancelFailed = () => {
    setContent('');
    setActiveMsg(null);
    onClose();
  };

  const charCount = content.length;
  const isCounterWarn = charCount > 120;

  return (
    <div className="livemap-message-panel">
      <div className="livemap-message-panel-header">
        <h4>Mensagem para Viatura {bus.busId}</h4>
        <button className="livemap-message-panel-close" onClick={onClose} title="Voltar">
          &times;
        </button>
      </div>

      {!isOnline && (
        <div className="livemap-msg-offline-banner">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.5a12.9 12.9 0 0 1-3.53 3.53m-10.4-10.4A12.9 12.9 0 0 0 2 12.5a12.9 12.9 0 0 0 10.4 4.1m4.1-4.1a3 3 0 0 0-4.1-4.1"></path>
          </svg>
          <span>Ativo Offline — Não é possível enviar mensagens no momento.</span>
        </div>
      )}

      {errorMsg && (
        <div style={{ color: 'var(--color-danger)', fontSize: '11px', fontWeight: '600', padding: '2px 4px' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {validationError && (
        <div style={{ color: 'var(--color-danger)', fontSize: '11px', fontWeight: '600', padding: '2px 4px' }}>
          ⚠️ {validationError}
        </div>
      )}

      <form className="livemap-msg-form" onSubmit={handleSend}>
        <div className="livemap-msg-textarea-wrapper">
          <textarea
            className={`livemap-msg-textarea ${validationError ? 'error' : ''}`}
            placeholder={isOnline ? "Digite a mensagem para o painel de bordo..." : "Viatura offline para comunicações"}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (validationError) setValidationError(null);
            }}
            disabled={!isOnline || loading || (activeMsg && activeMsg.estado === 'ENVIADA')}
          />
          <span className={`livemap-msg-counter ${isCounterWarn ? 'warning' : ''}`}>
            {charCount}/140
          </span>
        </div>

        <div className="livemap-msg-buttons">
          <button
            type="submit"
            className="livemap-msg-btn-send"
            disabled={!isOnline || loading || (activeMsg && activeMsg.estado === 'ENVIADA')}
          >
            {loading ? 'A processar...' : 'Enviar'}
          </button>
          <button type="button" className="livemap-msg-btn-cancel" onClick={onClose}>
            Fechar
          </button>
        </div>
      </form>

      {activeMsg && (
        <div className={`livemap-msg-status ${activeMsg.estado.toLowerCase()}`}>
          <span>
            {activeMsg.estado === 'ENVIADA' && '⏳ A enviar...'}
            {activeMsg.estado === 'ENTREGUE' && '✓ Entregue'}
            {activeMsg.estado === 'LIDA' && '✓✓ Lida'}
            {activeMsg.estado === 'FALHOU' && '✗ Falha na entrega'}
            {activeMsg.estado === 'CANCELADA' && '⚪ Cancelada'}
          </span>
          
          <div className="livemap-msg-status-actions">
            {activeMsg.estado === 'ENVIADA' && (
              <button className="livemap-msg-status-cancel" onClick={handleCancel}>
                Cancelar
              </button>
            )}
            {activeMsg.estado === 'FALHOU' && (
              <>
                <button className="livemap-msg-status-retry" onClick={handleRetry}>
                  Reenviar
                </button>
                <button className="livemap-msg-status-cancel" onClick={handleCancelFailed}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="livemap-msg-history">
        <h5>Histórico de Despacho</h5>
        {history.length === 0 ? (
          <div className="livemap-empty" style={{ fontSize: '11px', padding: '12px 0' }}>
            Nenhuma mensagem enviada anteriormente.
          </div>
        ) : (
          <div className="livemap-msg-history-list">
            {history.slice(0, 5).map((msg) => (
              <div key={msg.id} className="livemap-msg-history-item">
                <span className="livemap-msg-item-content">{msg.conteudo}</span>
                <div className="livemap-msg-item-meta">
                  <span>{new Date(msg.timestampEnvio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span className={`livemap-msg-badge-state ${msg.estado.toLowerCase()}`}>
                    {msg.estado === 'LIDA' ? 'Lida' : msg.estado.toLowerCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
