package dai.tub.pgu.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    //Configuração do broker
    @Override
    public void configureMessageBroker(MessageBrokerRegistry config){

        //Mensagens em Broadcast
        config.enableSimpleBroker("/topic");

        // Prefixo para mensagens que o React queira enviar para o Spring Boot
        config.setApplicationDestinationPrefixes("/app");
    }

    //Definir o URL de entrada para o React
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry){
        registry.addEndpoint("/ws-telemetry") // O nome real do endpoint de WebSockets
                .setAllowedOrigins("http://localhost:3000", "http://localhost:5173") // Portas do React/Vite
                .withSockJS(); // Em caso de falha do WebSocket, o SockJS tenta manter a comunicação
    }
}
    