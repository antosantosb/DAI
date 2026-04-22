import { useState, useEffect, useCallback, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import './Exports.css';

/**
 * Motor de Exportação Massiva (Backoffice).
 *
 * - Form para submeter um relatório (CSV/PDF) com filtros opcionais
 *   (busId, janela temporal).
 * - Lista de jobs submetidos nesta sessão, com estado ao vivo via STOMP.
 *
 * O toast "ficheiro pronto" global é emitido pelo GlobalToastListener;
 * aqui mantemos uma tabela mais rica com botão de download direto.
 */
export default function Exports() {
  const { hasRole, username } = useAuth();
  const isAdmin = hasRole('admin');
  const [format, setFormat]     = useState('CSV');
  const [busId, setBusId]       = useState('');
  const [fromTs, setFromTs]     = useState('');
  const [toTs, setToTs]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [busOptions, setBusOptions] = useState([]); // [{busCode, routeCode}]
  const [busPickerOpen, setBusPickerOpen] = useState(false);
  const [busHighlight, setBusHighlight]   = useState(-1);
  const busFieldRef = useRef(null);
  const jobsRef = useRef(jobs);

  // Mantém jobsRef sempre sincronizado com o state
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);

  // Modal de confirmação (mesmo padrão de Buses.jsx)
  const [modal, setModal] = useState({ open: false });
  const showModal = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  // Carrega jobs do backend ao abrir a página
  useEffect(() => {
    api.get('/exports')
      .then(r => setJobs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setJobs([]));
  }, []);

  // Popular sugestões de autocarros para o combobox
  useEffect(() => {
    api.get('/buses')
      .then(r => setBusOptions((r.data || []).map(b => ({
        busCode: b.busCode,
        routeCode: b.routeCode,
        routeName: b.routeName,
      }))))
      .catch(() => setBusOptions([]));
  }, []);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    if (!busPickerOpen) return;
    const onDocClick = (e) => {
      if (busFieldRef.current && !busFieldRef.current.contains(e.target)) {
        setBusPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [busPickerOpen]);

  // Sugestões filtradas pelo que já está escrito
  const filteredBuses = (() => {
    const q = busId.trim().toLowerCase();
    if (!q) return busOptions;
    return busOptions.filter(b =>
      b.busCode.toLowerCase().includes(q) ||
      (b.routeCode || '').toLowerCase().includes(q) ||
      (b.routeName || '').toLowerCase().includes(q)
    );
  })();

  const pickBus = (bus) => {
    setBusId(bus.busCode);
    setBusPickerOpen(false);
    setBusHighlight(-1);
  };

  const onBusKeyDown = (e) => {
    if (!busPickerOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setBusPickerOpen(true);
      return;
    }
    if (!busPickerOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setBusHighlight(i => Math.min(i + 1, filteredBuses.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setBusHighlight(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && busHighlight >= 0) {
      e.preventDefault();
      pickBus(filteredBuses[busHighlight]);
    } else if (e.key === 'Escape') {
      setBusPickerOpen(false);
    }
  };

  const upsertJob = useCallback((job) => {
    setJobs(prev => {
      const ix = prev.findIndex(j => j.jobUuid === job.jobUuid);
      return ix >= 0
        ? prev.map((j, i) => i === ix ? { ...j, ...job } : j)
        : [job, ...prev];
    });
  }, []);

  // ─── Subscrição STOMP para atualizar a tabela em tempo real ───
  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(`${window.location.origin}/ws-telemetry`),
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe('/topic/exports', (msg) => {
          if (!msg.body) return;
          try {
            const job = JSON.parse(msg.body);
            upsertJob(job);
          } catch (e) { console.error(e); }
        });
      },
    });
    client.activate();
    return () => client.deactivate();
  }, [upsertJob]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        format,
        busId:       busId.trim() || null,
        from:        fromTs ? new Date(fromTs).toISOString() : null,
        to:          toTs   ? new Date(toTs).toISOString()   : null,
        requestedBy: username,
      };
      const { data } = await api.post('/exports/telemetry', payload);
      upsertJob(data);
      toast.info('Pedido submetido');
    } catch (err) {
      console.error(err);
      toast.error('Falhou a submissão do pedido de exportação');
    } finally {
      setSubmitting(false);
    }
  };

  // Apagar um job (ficheiro + linha em BD). Usa Modal consistente com o resto da UI.
  const confirmDelete = (job) => {
    showModal({
      type: 'danger',
      title: 'Apagar relatório?',
      message:
        `Vais apagar o relatório ${job.format || ''} (${job.jobUuid.slice(0, 8)}…). ` +
        `Esta ação é permanente e o ficheiro deixará de estar disponível para descarga.`,
      confirmText: 'Apagar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeModal();
        try {
          await api.delete(`/exports/${job.jobUuid}`);
          setJobs(prev => prev.filter(j => j.jobUuid !== job.jobUuid));
          toast.success('Relatório apagado');
        } catch (err) {
          console.error('[exports] delete failed', err);
          const msg = err?.response?.status === 404
            ? 'O relatório já não existia no servidor.'
            : (err?.response?.data?.message || err?.message || 'Erro desconhecido');
          toast.error(`Falhou a remoção: ${msg}`);
        }
      },
    });
  };

  // Fallback: polling leve caso o STOMP falhe
  useEffect(() => {
    const pending = jobs.filter(j => j.status === 'PENDING' || j.status === 'PROCESSING');
    if (pending.length === 0) return;
    const iv = setInterval(async () => {
      for (const j of pending) {
        try {
          const { data } = await api.get(`/exports/${j.jobUuid}`);
          upsertJob(data);
        } catch { /* noop */ }
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [jobs, upsertJob]);

  return (
    <div className="exports-page">
      <header className="exports-header">
        <h1>Exportação Massiva</h1>
        <p>Gere relatórios CSV ou PDF com o histórico de telemetria. Serás avisado quando o ficheiro estiver pronto.</p>
      </header>

      <form className="exports-form" onSubmit={handleSubmit}>
        <div className="exports-field">
          <label>Formato</label>
          <select value={format} onChange={e => setFormat(e.target.value)}>
            <option value="CSV">CSV</option>
            <option value="PDF">PDF</option>
          </select>
        </div>

        <div className="exports-field" ref={busFieldRef}>
          <label htmlFor="exports-bus-input">Autocarro (opcional)</label>
          <div className={`exports-combobox ${busPickerOpen ? 'is-open' : ''}`}>
            <input
              id="exports-bus-input"
              type="text"
              role="combobox"
              aria-expanded={busPickerOpen}
              aria-controls="exports-bus-listbox"
              aria-autocomplete="list"
              placeholder={'Escolhe...'}
              value={busId}
              onChange={e => { setBusId(e.target.value); setBusPickerOpen(true); setBusHighlight(-1); }}
              onFocus={() => setBusPickerOpen(true)}
              onKeyDown={onBusKeyDown}
              autoComplete="off"
            />
            {busId && (
              <button
                type="button"
                className="exports-combobox-clear"
                onClick={() => { setBusId(''); setBusPickerOpen(false); }}
                aria-label="Limpar"
              >
                ×
              </button>
            )}
            <button
              type="button"
              className="exports-combobox-toggle"
              onClick={() => setBusPickerOpen(o => !o)}
              aria-label={busPickerOpen ? 'Fechar lista' : 'Abrir lista'}
              tabIndex={-1}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {busPickerOpen && busOptions.length > 0 && (
              <ul className="exports-combobox-list" id="exports-bus-listbox" role="listbox">
                {filteredBuses.length === 0 && (
                  <li className="exports-combobox-empty">Sem correspondências</li>
                )}
                {filteredBuses.map((b, i) => (
                  <li
                    key={b.busCode}
                    role="option"
                    aria-selected={busHighlight === i}
                    className={`exports-combobox-item ${busHighlight === i ? 'is-active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); pickBus(b); }}
                    onMouseEnter={() => setBusHighlight(i)}
                  >
                    <span className="exports-combobox-code">{b.busCode}</span>
                    {b.routeCode && (
                      <span className="exports-combobox-meta">
                        {b.routeCode}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="exports-field">
          <label>Desde</label>
          <input type="datetime-local" value={fromTs} onChange={e => setFromTs(e.target.value)} />
        </div>

        <div className="exports-field">
          <label>Até</label>
          <input type="datetime-local" value={toTs} onChange={e => setToTs(e.target.value)} />
        </div>

        <button type="submit" className="exports-submit" disabled={submitting}>
          {submitting ? 'A submeter...' : 'Gerar relatório'}
        </button>
      </form>

      <section className="exports-history">
        <div className="exports-history-head">
          <h2>Pedidos desta sessão</h2>
          <p className="exports-retention-note">
            Os relatórios são apagados automaticamente após 7 dias.
          </p>
        </div>
        {jobs.length === 0
          ? <p className="exports-empty">Ainda não submeteste nenhum pedido.</p>
          : (
            <table className="exports-table">
              <thead>
                <tr>
                  <th>Formato</th>
                  <th>Estado</th>
                  <th>Linhas</th>
                  <th>Ficheiro</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.jobUuid}>
                    <td>{j.format}</td>
                    <td>
                      <span className={`exports-badge exports-badge-${j.status}`}>
                        {j.status}
                      </span>
                    </td>
                    <td>{j.rowCount ?? '-'}</td>
                    <td className="exports-filename" title={j.fileName || ''}>
                      {j.fileName
                        ? `relatorio-${j.jobUuid.slice(0, 8)}.${(j.format || 'csv').toLowerCase()}`
                        : '-'}
                    </td>
                    <td>
                      <div className="exports-actions">
                        {j.status === 'COMPLETED' && j.downloadUrl && (
                          <>
                            {(j.format || '').toUpperCase() === 'PDF' && (
                              <button
                                type="button"
                                className="exports-view"
                                onClick={async () => {
                                  try {
                                    const res = await api.get(j.downloadUrl.replace(/^.*\/api\/v1/, ''), { responseType: 'blob' });
                                    const blob = new Blob([res.data], { type: 'application/pdf' });
                                    window.open(window.URL.createObjectURL(blob), '_blank');
                                  } catch {
                                    toast.error('Falhou ao abrir o PDF');
                                  }
                                }}
                              >
                                Ver
                              </button>
                            )}
                            <button
                              type="button"
                              className="exports-download"
                              onClick={async () => {
                                try {
                                  const res = await api.get(j.downloadUrl.replace(/^.*\/api\/v1/, ''), { responseType: 'blob' });
                                  const ext = (j.format || 'csv').toLowerCase();
                                  const url = window.URL.createObjectURL(res.data);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `relatorio-${j.jobUuid.slice(0, 8)}.${ext}`;
                                  document.body.appendChild(a);
                                  a.click();
                                  a.remove();
                                  window.URL.revokeObjectURL(url);
                                } catch {
                                  toast.error('Falhou o download do ficheiro');
                                }
                              }}
                            >
                              Descarregar
                            </button>
                          </>
                        )}
                        {j.status === 'FAILED' && (
                          <span className="exports-error" title={j.errorMessage}>
                            Ver erro
                          </span>
                        )}
                        {isAdmin && (j.status === 'COMPLETED' || j.status === 'FAILED') && (
                          <button
                            type="button"
                            className="exports-delete"
                            onClick={() => confirmDelete(j)}
                            title="Apagar relatório"
                            aria-label="Apagar relatório"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </section>

      <Modal
        open={modal.open}
        onClose={closeModal}
        onConfirm={modal.onConfirm}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
      />
    </div>
  );
}
