import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import api from '../services/api';
import './Chatbot.css';

const SUGGESTIONS = [
  "Que linhas tiveram mais atrasos hoje?",
  "Qual a ocupação média da Linha 5 esta semana?",
  "Quantas ocorrências críticas estão abertas?",
  "Quanto consumimos em eletricidade este mês?",
  "Que motoristas têm discrepâncias de bilhética?"
];

export default function Chatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text) => {
    const userMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/api/v1/ai/chat', {
        message: text,
        sessionId
      });

      const assistantMessage = {
        role: 'assistant',
        content: res.data.response,
        toolsUsed: res.data.toolsUsed,
        latencyMs: res.data.latencyMs,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (e) {
      const errorMessage = {
        role: 'error',
        content: e.response?.data?.message || 'Erro ao processar pergunta.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
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

  return (
    <div className="chatbot-container">
      <div className="chatbot-banner">
        IA generativa — Gemma 4 on-premises | Dados não saem do servidor PGU
      </div>

      <main className="chatbot-main">
        {messages.length === 0 ? (
          <div className="chatbot-welcome">
            <h2>Assistente de IA — Gestão Urbana TUB</h2>
            <p>Posso ajudar com perguntas sobre operação, frota, atrasos, ocorrências, energia.</p>
            <p><strong>Limitações:</strong> não tenho acesso a dados pessoais, não posso modificar dados, posso cometer imprecisões.</p>
            <h3>Experimente perguntar:</h3>
            <ul className="chatbot-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <li key={i} onClick={() => send(s)}>{s}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="chatbot-messages">
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
              <div className="chatbot-message chatbot-message-loading">
                <span className="dots">A pensar</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      <form onSubmit={handleSubmit} className="chatbot-input-form">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Faça uma pergunta operacional..."
          rows={2}
          maxLength={500}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <div className="chatbot-input-footer">
          <span className="chatbot-char-counter">{input.length}/500</span>
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? 'A processar...' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  );
}
