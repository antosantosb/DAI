import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { createStompClient } from '../services/stompClient';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';

// Sprint 0 (F4 follow-up): após 10s, o toast colapsa para um círculo pequeno
// com spinner; hover expande de volta. Evita ocupar espaço durante syncs longos.
const GTFS_TOAST_ID = 'gtfs-progress';
const COLLAPSE_DELAY_MS = 10000;
// O `className` no toast.loading SUBSTITUI o `toastClassName` default
// do <ToastContainer>, por isso temos de incluir 'pgu-toast' aqui.
const GTFS_BASE_CLASS = 'pgu-toast pgu-gtfs-collapsible';

// Helper: cria o conteúdo do toast de progresso GTFS a partir de um payload
// { step, message, progress }. Partilhado entre o resume on-mount e o WS handler.
function gtfsProgressContent(p) {
  return (
    <div>
      <div className="pgu-toast-title">Sincronização GTFS</div>
      <div className="pgu-toast-sub">{p.message}</div>
      <div className="pgu-progress-track">
        <div className="pgu-progress-fill" style={{ width: `${p.progress}%` }} />
      </div>
    </div>
  );
}

/**
 * Subscreve tópicos STOMP globais e emite toasts.
 * Invisível — montar uma única vez no Layout.
 */
export default function GlobalToastListener() {
  const collapseTimerRef = useRef(null);
  const { authenticated } = useAuth();

  const armCollapseTimer = () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      // DOM directa: o react-toastify aplica id={toastId} ao toast div,
      // por isso podemos adicionar a class sem passar pelo toast.update
      // (que reseta render e pode descartar className).
      const el = document.getElementById(GTFS_TOAST_ID);
      if (el) el.classList.add('is-collapsed');
      collapseTimerRef.current = null;
    }, COLLAPSE_DELAY_MS);
  };

  const clearCollapseTimer = () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  };

  // Sprint 0 (F4 follow-up): se houver sync GTFS em curso quando a app carrega
  // (ex.: user fez F5 a meio), reconstruir o toast a partir do backend.
  // Sprint 0 (F5 follow-up): só faz a request quando autenticado — senão
  // o api.js intercepta 401 e força login do Keycloak, redirecionando a
  // Landing automaticamente.
  useEffect(() => {
    if (!authenticated) return;
    api.get('/gtfs/sync-status').then((r) => {
      if (r.status === 200 && r.data) {
        toast.loading(gtfsProgressContent(r.data), {
          toastId: GTFS_TOAST_ID,
          autoClose: false,
          closeOnClick: false,
          closeButton: false,
          className: GTFS_BASE_CLASS,
        });
        armCollapseTimer();
      }
    }).catch(() => { /* 204 ou erro: nada a mostrar */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  useEffect(() => {
    // Sprint 0 (F5 follow-up): so' conecta STOMP quando autenticado.
    if (!authenticated) return;
    // Sprint -1 (SEC-4): client autenticado via JWT no CONNECT.
    const stompClient = createStompClient({
      onConnect: () => {

        // ─── Emergências de terreno ───
        stompClient.subscribe('/topic/telemetry', (message) => {
          if (!message.body) return;
          try {
            const p = JSON.parse(message.body);
            if (p.status === 'emergency') {
              toast.error(`Emergência: autocarro ${p.busId}`, {
                autoClose: 10000,
                toastId: `emergency-${p.busId}`,
              });
            }
          } catch (e) { /* ignore */ }
        });

        // ─── Exportações ───
        stompClient.subscribe('/topic/exports', (message) => {
          if (!message.body) return;
          try {
            const job = JSON.parse(message.body);
            if (job.status === 'COMPLETED') {
              toast.success(
                ({ closeToast }) => (
                  <div>
                    <div className="pgu-toast-title">Relatório {job.format} pronto</div>
                    {job.fileName && <div className="pgu-toast-sub">{job.fileName}</div>}
                    <a href={job.downloadUrl} onClick={() => closeToast()} className="pgu-toast-action">
                      Descarregar
                    </a>
                  </div>
                ),
                { autoClose: 15000, closeOnClick: false, toastId: `exp-${job.jobUuid}` }
              );
            }
            if (job.status === 'FAILED') {
              toast.error(`Exportação falhou`, {
                autoClose: 8000,
                toastId: `exp-${job.jobUuid}`,
              });
            }
          } catch (e) { /* ignore */ }
        });

        // ─── Ocorrências ───
        stompClient.subscribe('/topic/alertas', (message) => {
          if (!message.body) return;
          try {
            const o = JSON.parse(message.body);
            if (o.estado === 'ABERTA') {
              toast.error(
                <div>
                  <div className="pgu-toast-title">{o.tipoAnomalia}</div>
                  <div className="pgu-toast-sub">Ativo {o.ativoId}</div>
                  <a href={`/backoffice/ocorrencias/${o.id}`} className="pgu-toast-action">
                    Ver
                  </a>
                </div>,
                { autoClose: false, closeOnClick: false, toastId: `alerta-${o.id}` }
              );
            }
          } catch (e) { /* ignore */ }
        });

        // ─── GTFS Progress ───
        stompClient.subscribe('/topic/gtfs/progress', (message) => {
          if (!message.body) return;
          try {
            const p = JSON.parse(message.body);
            const id = GTFS_TOAST_ID;

            if (p.step === 'COMPLETED') {
              clearCollapseTimer();
              toast.dismiss(id);
              toast.success('Sincronização GTFS concluída', { autoClose: 5000, toastId: 'gtfs-done' });
            } else if (p.step === 'FAILED') {
              clearCollapseTimer();
              toast.dismiss(id);
              toast.error('Sincronização GTFS falhou', { autoClose: 8000, toastId: 'gtfs-fail' });
            } else if (p.step === 'SKIPPED') {
              clearCollapseTimer();
              toast.dismiss(id);
              toast.info('Dados GTFS já atualizados', { autoClose: 3000, toastId: 'gtfs-skip' });
            } else {
              // Sprint 0 (F4 follow-up): conteudo atualizado em vivo. Primeira vez
              // chama toast.loading(); subsequentes usam toast.update() para
              // refrescar message + progress no mesmo toast.
              const content = gtfsProgressContent(p);
              if (toast.isActive(id)) {
                toast.update(id, { render: content });
              } else {
                toast.loading(content, {
                  toastId: id, autoClose: false, closeOnClick: false, closeButton: false,
                  className: GTFS_BASE_CLASS,
                });
                armCollapseTimer();
              }
            }
          } catch (e) { /* ignore */ }
        });

        // ─── Escalada ───
        stompClient.subscribe('/topic/alertas-escalada', (message) => {
          if (!message.body) return;
          try {
            toast.warn('Escalamento crítico', {
              autoClose: false,
              toastId: `esc-${Date.now()}`,
            });
          } catch (e) { /* ignore */ }
        });
      },
    });

    stompClient.activate();
    return () => {
      stompClient.deactivate();
      clearCollapseTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  return null;
}
