import { useEffect } from 'react';
import { toast } from 'react-toastify';
import { createStompClient } from '../services/stompClient';

/**
 * Subscreve tópicos STOMP globais e emite toasts.
 * Invisível — montar uma única vez no Layout.
 */
export default function GlobalToastListener() {
  useEffect(() => {
    // Sprint -1 (SEC-4): client autenticado via JWT no CONNECT.
    const stompClient = createStompClient({
      onConnect: () => {

        // ─── Emergências de terreno ───
        stompClient.subscribe('/topic/telemetry', (message) => {
          if (!message.body) return;
          try {
            const p = JSON.parse(message.body);
            if (p.status === 'emergency') {
              toast.error(`Emergência — Autocarro ${p.busId}`, {
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
            const id = 'gtfs-progress';

            if (p.step === 'COMPLETED') {
              toast.dismiss(id);
              toast.success('Sincronização GTFS concluída', { autoClose: 5000, toastId: 'gtfs-done' });
            } else if (p.step === 'FAILED') {
              toast.dismiss(id);
              toast.error('Sincronização GTFS falhou', { autoClose: 8000, toastId: 'gtfs-fail' });
            } else if (p.step === 'SKIPPED') {
              toast.info('Dados GTFS já atualizados', { autoClose: 3000, toastId: 'gtfs-skip' });
            } else {
              toast.loading(
                <div>
                  <div className="pgu-toast-title">Sincronização GTFS</div>
                  <div className="pgu-toast-sub" style={{ fontFamily: 'inherit' }}>{p.message}</div>
                  <div className="pgu-progress-track">
                    <div className="pgu-progress-fill" style={{ width: `${p.progress}%` }}/>
                  </div>
                </div>,
                { toastId: id, autoClose: false, closeOnClick: false, closeButton: false }
              );
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
    return () => stompClient.deactivate();
  }, []);

  return null;
}
