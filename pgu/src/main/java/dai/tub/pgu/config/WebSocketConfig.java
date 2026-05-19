package dai.tub.pgu.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer
{
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
        // Endpoint STOMP puro (sem SockJS) — @stomp/stompjs v7 usa WebSocket nativo
        registry.addEndpoint("/ws-telemetry")
                .setAllowedOriginPatterns("*");
    }
}
