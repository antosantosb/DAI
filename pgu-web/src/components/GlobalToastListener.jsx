import { useEffect } from 'react';
import { toast } from 'react-toastify';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

/**
 * Subscreve tópicos STOMP globais e emite toasts:
 *   /topic/telemetry  - emergências no terreno
 *   /topic/exports    - avisos do Motor de Exportação Massiva
 *                       (PROCESSING / COMPLETED / FAILED)
 *
 * Invisível. Colocar uma única vez no Layout do Backoffice.
 */
export default function GlobalToastListener() {
  useEffect(() => {
    const stompClient = new Client({
      webSocketFactory: () => new SockJS(`${window.location.origin}/ws-telemetry`),
      reconnectDelay: 5000,
      onConnect: () => {
        console.log('Global Toast Listener connected via SockJS');

        // ─── Emergências de terreno ───
        stompClient.subscribe('/topic/telemetry', (message) => {
          if (!message.body) return;
          try {
            const payload = JSON.parse(message.body);
            if (payload.status === 'emergency') {
              toast.error(
                `Emergência no terreno - Autocarro ${payload.busId}`,
                {
                  position: "top-right",
                  autoClose: 10000,
                  hideProgressBar: false,
                  closeOnClick: true,
                  pauseOnHover: true,
                  draggable: true,
                }
              );
            }
          } catch (e) {
            console.error("Erro no parser global (telemetry)", e);
          }
        });

        // ─── Motor de Exportação Massiva ───
        stompClient.subscribe('/topic/exports', (message) => {
          if (!message.body) return;
          try {
            const job = JSON.parse(message.body);
            const fmt = job.format || '';

            // NOTA: o toast de "submetido" é emitido em Exports.jsx
            // (ao criar o pedido). Aqui só anunciamos estados terminais
            // para evitar ruído quando o job passa por PROCESSING.
            if (job.status === 'COMPLETED') {
              const rows = job.rowCount != null ? ` · ${job.rowCount} linhas` : '';
              toast.success(
                ({ closeToast }) => (
                  <div>
                    <div className="pgu-toast-title">
                      Relatório {fmt} pronto
                    </div>
                    {job.fileName && (
                      <div className="pgu-toast-sub">{job.fileName}</div>
                    )}
                    <a
                      href={job.downloadUrl}
                      onClick={() => closeToast()}
                      className="pgu-toast-action"
                    >
                      Descarregar
                    </a>
                  </div>
                ),
                {
                  autoClose: 15000,
                  closeOnClick: false,
                  toastId: `exp-${job.jobUuid}`,
                }
              );
            }
            if (job.status === 'FAILED') {
              toast.error(
                `Exportação ${fmt} falhou: ${job.errorMessage || 'erro desconhecido'}`,
                { autoClose: 10000, toastId: `exp-${job.jobUuid}` }
              );
            }
          } catch (e) {
            console.error("Erro no parser global (exports)", e);
          }
        });
      },
    });

    stompClient.activate();
    return () => stompClient.deactivate();
  }, []);

  return null;
}
