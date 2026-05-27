import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
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

/**
 * Subscreve tópicos STOMP globais e emite toasts.
 * Invisível — montar uma única vez no Layout.
 */
export default function GlobalToastListener() {
  const { t } = useTranslation();
  const collapseTimerRef = useRef(null);
  const { authenticated } = useAuth();

  // Helper: cria o conteúdo do toast de progresso GTFS a partir de um payload
  // { step, message, progress }. Partilhado entre o resume on-mount e o WS handler.
  const gtfsProgressContent = (p) => {
    // Mapeia step backend (DOWNLOADING/PROCESSING_STOPS/...) para mensagem
    // traduzida. Fallback para p.message se step desconhecido.
    const stepKey = p.step ? `toasts.gtfsSteps.${p.step}` : null;
    const translated = stepKey ? t(stepKey, { defaultValue: '' }) : '';
    const text = translated || p.message || '';
    return (
      <div>
        <div className="pgu-toast-title">{t('toasts.gtfsTitle')}</div>
        <div className="pgu-toast-sub">{text}</div>
        <div className="pgu-progress-track">
          <div className="pgu-progress-fill" style={{ width: `${p.progress}%` }} />
        </div>
      </div>
    );
  };

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

  // F9: Resume após F5 — se houver exports do user em RUNNING/PENDING ao montar,
  // mostra toasts loading para que o user saiba que ainda estão a correr.
  // O WS depois actualiza/dismisses quando completar/falhar/cancelar.
  useEffect(() => {
    if (!authenticated) return;
    api.get('/exports?owner=me').then((r) => {
      const jobs = Array.isArray(r.data) ? r.data : [];
      jobs.filter(j => j.status === 'PROCESSING' || j.status === 'PENDING').forEach(j => {
        toast.loading(
          <div>
            <div className="pgu-toast-title">{t('toasts.exportRunning')}</div>
            <div className="pgu-toast-sub">{t('toasts.exportRunningSub', { format: j.format })}</div>
          </div>,
          { toastId: `exp-${j.jobUuid}`, autoClose: false, closeOnClick: false, closeButton: true }
        );
      });
    }).catch(() => { /* sem permissões ou sem jobs */ });
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
              toast.error(t('toasts.emergency', { busId: p.busId }), {
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
            const id = `exp-${job.jobUuid}`;
            // F9: se já existe toast loading (resume após F5 ou enquanto processa),
            // primeiro fecha-o para evitar conflito de tipo (loading -> success).
            if (toast.isActive(id)) toast.dismiss(id);

            if (job.status === 'COMPLETED') {
              toast.success(
                ({ closeToast }) => (
                  <div>
                    <div className="pgu-toast-title">{t('toasts.exportReady', { format: job.format })}</div>
                    {job.fileName && <div className="pgu-toast-sub">{job.fileName}</div>}
                    <button
                      type="button"
                      className="pgu-toast-action"
                      onClick={async () => {
                        // F9 (MinIO): pedir presigned URL fresca antes de abrir.
                        try {
                          const path = (job.downloadUrl || '').replace(/^.*\/api\/v1/, '');
                          if (!path) return;
                          const res = await api.get(path);
                          const presigned = res?.data?.url;
                          if (!presigned) return;
                          const a = document.createElement('a');
                          a.href = presigned;
                          a.download = job.fileName || 'export';
                          a.rel = 'noopener noreferrer';
                          document.body.appendChild(a); a.click(); a.remove();
                        } finally { closeToast(); }
                      }}
                    >
                      {t('toasts.exportDownload')}
                    </button>
                  </div>
                ),
                { autoClose: 15000, closeOnClick: false, toastId: id }
              );
            }
            if (job.status === 'FAILED') {
              toast.error(t('toasts.exportFailed'), { autoClose: 8000, toastId: id });
            }
            // F9: novo estado terminal
            if (job.status === 'CANCELED') {
              toast.info(t('toasts.exportCanceled'), { autoClose: 5000, toastId: id });
            }
            // F9: se o backend anunciar PROCESSING (worker pegou) e ainda não
            // temos toast, mostrar loading. Útil para jobs submetidos noutro tab.
            if (job.status === 'PROCESSING' && !toast.isActive(id)) {
              toast.loading(
                <div>
                  <div className="pgu-toast-title">{t('toasts.exportRunning')}</div>
                  <div className="pgu-toast-sub">{t('toasts.exportRunningSub', { format: job.format })}</div>
                </div>,
                { toastId: id, autoClose: false, closeOnClick: false, closeButton: true }
              );
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
                  <div className="pgu-toast-sub">{t('toasts.alertAssetLabel', { id: o.ativoId })}</div>
                  <a href={`/backoffice/ocorrencias/${o.id}`} className="pgu-toast-action">
                    {t('toasts.alertViewLink')}
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
              toast.success(t('toasts.gtfsCompleted'), { autoClose: 5000, toastId: 'gtfs-done' });
            } else if (p.step === 'FAILED') {
              clearCollapseTimer();
              toast.dismiss(id);
              toast.error(t('toasts.gtfsFailed'), { autoClose: 8000, toastId: 'gtfs-fail' });
            } else if (p.step === 'SKIPPED') {
              clearCollapseTimer();
              toast.dismiss(id);
              toast.info(t('toasts.gtfsSkipped'), { autoClose: 3000, toastId: 'gtfs-skip' });
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
            toast.warn(t('toasts.escalation'), {
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
