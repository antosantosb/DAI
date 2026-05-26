import { Client } from '@stomp/stompjs';
import keycloak from '../keycloak';

/**
 * Sprint -1 (SEC-4) — Helper para criar STOMP clients autenticados.
 *
 * O backend exige JWT no frame CONNECT (WebSocketSecurityConfig). Este factory:
 *  - obtem o token actual do Keycloak singleton
 *  - injecta em connectHeaders e em beforeConnect (auto-refresh em reconnects)
 *  - centraliza URL e reconnectDelay
 *
 * Uso:
 *   const client = createStompClient({
 *     onConnect: () => { client.subscribe('/topic/telemetry', cb); },
 *   });
 *   client.activate();
 *
 *   return () => client.deactivate();
 */
export function createStompClient(opts = {}) {
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-telemetry`;

  const client = new Client({
    brokerURL: wsUrl,
    reconnectDelay: 5000,
    // Em cada (re)conexao, recolhe o token actual do Keycloak.
    // Se o token estiver expirado, tenta refresh; se falhar, deixa connectHeaders vazio
    // (o backend rejeita o CONNECT e o cliente espera o proximo reconnect).
    beforeConnect: async () => {
      try {
        if (keycloak.authenticated) {
          await keycloak.updateToken(30);
        }
        if (keycloak.token) {
          client.connectHeaders = { Authorization: `Bearer ${keycloak.token}` };
        }
      } catch (err) {
        console.warn('STOMP beforeConnect: nao foi possivel obter token JWT', err);
      }
    },
    ...opts,
  });

  return client;
}
