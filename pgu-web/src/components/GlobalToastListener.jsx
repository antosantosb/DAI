import { useEffect } from 'react';
import { toast } from 'react-toastify';
import { Client } from '@stomp/stompjs';

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
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-telemetry`;
    const stompClient = new Client({
      brokerURL: wsUrl,
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

        // ─── Ocorrências / Alertas ───
        stompClient.subscribe('/topic/alertas', (message) => {
          if (!message.body) return;
          try {
            const ocorrencia = JSON.parse(message.body);
            if (ocorrencia.estado === 'ABERTA') {
              toast.error(
                <div>
                  <strong>🚨 Novo alarme: {ocorrencia.tipoAnomalia} — Ativo {ocorrencia.ativoId}</strong>
                  <div style={{ marginTop: '6px' }}>
                    <a href={`/backoffice/ocorrencias/${ocorrencia.id}`} className="pgu-toast-action">
                      Ver Ocorrência
                    </a>
                  </div>
                </div>,
                {
                  autoClose: 0,
                  closeOnClick: false,
                  toastId: `alerta-${ocorrencia.id}`
                }
              );
            }
          } catch (e) {
            console.error("Erro no parser global (alertas)", e);
          }
        });

        // ─── Alertas de Escalada ───
        stompClient.subscribe('/topic/alertas-escalada', (message) => {
          if (!message.body) return;
          try {
            toast.warn(
              <div>
                <strong>⚠️ Escalamento Crítico!</strong>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>{message.body}</div>
              </div>,
              {
                autoClose: 0,
                closeOnClick: true,
                toastId: `escalada-${Date.now()}`
              }
            );
          } catch (e) {
            console.error("Erro no parser global (alertas-escalada)", e);
          }
        });
      },
    });


    stompClient.activate();
    return () => stompClient.deactivate();
  }, []);

  return null;
}
