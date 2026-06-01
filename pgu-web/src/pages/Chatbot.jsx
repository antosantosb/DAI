// Sprint 7 (chatbot IA): assistente conversacional standalone (sem sidebar).
// Layout coluna full-screen: header (back + titulo + status), banner de
// privacidade, scroll area com mensagens, sticky input form. CSS usa tokens
// var(--color-*) para suporte automatico de dark theme.

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { IconChatbot } from '../components/NavIcon';
import './Chatbot.css';

// Curto e directo — 4 sugestões em chips horizontais (não cards grandes).
const SUGGESTIONS = [
  'Linhas com mais atrasos hoje',
  'Ocupação média da Linha 5 esta semana',
  'Ocorrências críticas abertas',
  'Consumo de eletricidade este mês',
];

export default function Chatbot() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const userMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Endpoint /ai/chat (nao streaming) — tem as tools registadas no
      // chatClient, permite ao modelo invocar AiTools.* para consultar
      // dados reais em vez de inventar. Mais lento (sem feedback ate' a
      // resposta estar pronta) mas devolve dados verdadeiros.
      const res = await api.post('/ai/chat', {
        message: text,
        sessionId,
      }, { timeout: 180000 });

      const assistantMessage = {
        role: 'assistant',
        content: res.data.response,
        toolsUsed: res.data.toolsUsed,
        latencyMs: res.data.latencyMs,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e) {
      const errorMessage = {
        role: 'error',
        content: e.response?.data?.message || e.message || 'Erro ao processar pergunta.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !loading) {
      send(input.trim());
    }
  };

  const charCount = input.length;
  const charWarn = charCount > 450;

  return (
    <div className="chatbot-container">
      {/* Header com back button + titulo + status */}
      <header className="chatbot-header">
        <button
          type="button"
          className="chatbot-back-btn"
          onClick={() => navigate('/backoffice')}
          aria-label={t('common.back', 'Voltar')}
          title={t('common.back', 'Voltar')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="chatbot-header-title">
          <h1>{t('nav.chatbot')}</h1>
          <span className="chatbot-header-subtitle">
            <span className="chatbot-status-dot" aria-hidden="true" />
            Qwen 2.5 · on-premises
          </span>
        </div>
      </header>

      {/* Scroll area */}
      <main className="chatbot-main">
        <div className="chatbot-main-inner">
          {messages.length === 0 ? (
            <div className="chatbot-welcome">
              <div className="chatbot-welcome-icon" aria-hidden="true">
                <IconChatbot />
              </div>
              <h2>Como posso ajudar?</h2>
              <ul className="chatbot-suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <li
                    key={i}
                    tabIndex={0}
                    role="button"
                    onClick={() => send(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        send(s);
                      }
                    }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="chatbot-messages" aria-live="polite">
              {messages.map((m, i) => (
                <div key={i} className={`chatbot-message chatbot-message-${m.role}`}>
                  <div className="chatbot-message-content">{m.content}</div>
                  {m.toolsUsed?.length > 0 && (
                    <div className="chatbot-message-tools">
                      via {m.toolsUsed.join(', ')} · {m.latencyMs}ms
                    </div>
                  )}
                  <time>{m.timestamp.toLocaleTimeString('pt-PT')}</time>
                </div>
              ))}
              {loading && (
                <div className="chatbot-message-loading" aria-label="A pensar">
                  <span className="chatbot-typing-dots" aria-hidden="true">
                    <span /><span /><span />
                  </span>
                  <span>A pensar...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input form sticky */}
      <form onSubmit={handleSubmit} className="chatbot-input-form">
        <div className="chatbot-input-inner">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Faça uma pergunta operacional..."
            rows={2}
            maxLength={500}
            disabled={loading}
            aria-label="Pergunta"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <div className="chatbot-input-footer">
            <span className={`chatbot-char-counter${charWarn ? ' warn' : ''}`}>
              {charCount}/500
            </span>
            <button type="submit" disabled={loading || !input.trim()}>
              {loading ? 'A processar...' : 'Enviar'}
              {!loading && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
