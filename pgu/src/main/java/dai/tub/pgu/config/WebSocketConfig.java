package dai.tub.pgu.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer
{
    /**
     * Lista de origens permitidas para STOMP/WebSocket.
     * Configurável via env var WS_ALLOWED_ORIGINS (separadas por vírgula).
     * Default cobre dev local + domínio Azure de demo.
     */
    @Value("${pgu.websocket.allowed-origins:http://localhost:5173,http://localhost,https://localhost,http://localhost:80,https://localhost:5443,http://localhost:5443,https://pgu-tub.switzerlandnorth.cloudapp.azure.com,https://pgu-tub-v2.switzerlandnorth.cloudapp.azure.com}")
    private String[] allowedOrigins;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config)
    {
        // Mensagens em broadcast para os clientes subscritores
        config.enableSimpleBroker("/topic");

        // Prefixo para mensagens enviadas do Frontend para o Spring Boot
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry)
    {
        // Endpoint STOMP puro (sem SockJS) — @stomp/stompjs v7 usa WebSocket nativo.
        // Sprint -1 (SEC-3): origens restritas. "*" permitia que qualquer site malicioso
        // aberto no browser do utilizador subscrevesse /topic/telemetry.
        registry.addEndpoint("/ws-telemetry")
                .setAllowedOrigins(allowedOrigins);
    }
}
