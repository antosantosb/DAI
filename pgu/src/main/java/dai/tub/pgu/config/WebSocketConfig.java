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
    }

    //Definir o URL de entrada para o React
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry){

        //URl de ligação do React "http://localhost:8081/..."
        //"/..." é um placeholder
        registry.addEndpoint("/...");

        //pelo que percebi o react usa as portas 3000 e 5173
        //então temos que fazer isto para poder usar a 8081
        registry.setAllowedOrigins("http://localhost:3000", "http://localhost:5173");

        //em caso de falha do WebSocket o SockJS tenta manter a comunicação
        registry.withSockJS();
    }
}
