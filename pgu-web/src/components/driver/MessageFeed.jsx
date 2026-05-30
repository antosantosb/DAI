import React, { useEffect, useRef } from 'react';
import { Clock, Check, CheckCheck, X, Trash2, MessageSquare } from 'lucide-react';
import './DriverConsole.css';

// Formata o timestamp ISO em HH:MM
function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function MessageFeed({ 
  messages, 
  onConfirmRead, 
  online,
  confirmingMsgIds // Dicionário { mqttMessageId: true } para loading states
}) {
  const bottomRef = useRef(null);

  // Auto-scroll para a última mensagem sempre que a lista mudar
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <section className="driver-panel-right">
      <div className="driver-feed-header">
        <h2 className="driver-panel-title">Mensagens do CCO (UC7)</h2>
        <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 'bold' }}>
          {messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}
        </span>
      </div>

      <div className="driver-feed-container">
        {messages.length === 0 ? (
          <div className="driver-feed-empty">
            <MessageSquare size={48} />
            <p>Nenhuma mensagem recebida</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isLida = msg.estado === 'LIDA';
            const isEntregue = msg.estado === 'ENTREGUE';
            const isFalhou = msg.estado === 'FALHOU';
            const isCancelada = msg.estado === 'CANCELADA';
            const isConfirming = confirmingMsgIds[msg.mqttMessageId] || false;

            // Renderizar o badge de estado reativo
            const renderBadge = () => {
              if (isCancelada) {
                return (
                  <span className="driver-msg-badge cancelada">
                    <Trash2 size={12} /> Cancelada
                  </span>
                );
              }
              if (isFalhou) {
                return (
                  <span className="driver-msg-badge falhou">
                    <X size={12} /> Não Entregue
                  </span>
                );
              }
              if (isLida) {
                return (
                  <span className="driver-msg-badge lida">
                    <CheckCheck size={12} /> Lida
                  </span>
                );
              }
              if (isEntregue) {
                return (
                  <span className="driver-msg-badge entregue">
                    <Check size={12} /> Recebida
                  </span>
                );
              }
              return (
                <span className="driver-msg-badge enviada">
                  <Clock size={12} /> Enviada
                </span>
              );
            };

            return (
              <div 
                key={msg.mqttMessageId || msg.id} 
                className={`driver-msg-card ${isLida ? 'lida' : ''} ${isCancelada ? 'cancelada' : ''}`}
                id={`msg-card-${msg.id}`}
              >
                <div className="driver-msg-header">
                  <span className="driver-msg-author">
                    {msg.operador || 'Operador Central'}
                  </span>
                  <span className="driver-msg-time">
                    {formatTime(msg.timestampEnvio || new Date())}
                  </span>
                </div>
                
                <div 
                  className="driver-msg-body"
                  style={isCancelada ? { textDecoration: 'line-through', opacity: 0.5 } : {}}
                >
                  {msg.conteudo}
                </div>

                {isFalhou && msg.erroDetalhe && (
                  <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px', fontWeight: 'bold' }}>
                    {msg.erroDetalhe}
                  </div>
                )}

                <div className="driver-msg-footer">
                  {renderBadge()}
                </div>

                {/* Apenas exibir botão de confirmação para mensagens ENTREGUES e não lidas */}
                {isEntregue && !isLida && (
                  <button
                    className={`driver-ack-btn ${isConfirming ? 'loading-ack' : ''}`}
                    onClick={() => onConfirmRead(msg)}
                    disabled={!online || isConfirming}
                    id={`btn-ack-msg-${msg.id}`}
                  >
                    {isConfirming ? (
                      <>
                        <div className="driver-btn-spinner" style={{ width: '20px', height: '20px' }} />
                        <span>A processar leitura...</span>
                      </>
                    ) : (
                      <>
                        <CheckCheck size={20} />
                        <span>✓ Confirmar Leitura</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
