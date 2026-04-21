import { useEffect } from 'react';
import { toast } from 'react-toastify';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export default function GlobalToastListener() {
  useEffect(() => {
    const stompClient = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8081/ws-telemetry'),
      reconnectDelay: 5000,
      onConnect: () => {
        console.log('Global Toast Listener connected via SockJS');
        
        stompClient.subscribe('/topic/telemetry', (message) => {
          if (message.body) {
            try {
              const payload = JSON.parse(message.body);
              if (payload.status === 'emergency') {
                toast.error(
                  `⚠️ EMERGÊNCIA NO TERRENO • Autocarro: ${payload.busId}`, 
                  {
                    position: "top-right",
                    autoClose: 10000, // 10 seconds
                    hideProgressBar: false,
                    closeOnClick: true,
                    pauseOnHover: true,
                    draggable: true,
                    progress: undefined,
                  }
                );
              }
            } catch(e) {
                console.error("Erro no parser global", e);
            }
          }
        });
      },
    });

    stompClient.activate();

    return () => stompClient.deactivate();
  }, []);

  // Invisible component
  return null;
}
