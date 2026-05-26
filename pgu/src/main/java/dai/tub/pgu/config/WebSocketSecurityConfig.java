package dai.tub.pgu.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Sprint -1 (SEC-4) — Autentica ligacoes STOMP via JWT no frame CONNECT.
 *
 * Sem isto, qualquer cliente que conhecesse a URL /ws-telemetry podia
 * subscrever /topic/telemetry e ler toda a telemetria em tempo real.
 *
 * O cliente JavaScript tem de enviar o header Authorization no CONNECT:
 *
 *   new Client({
 *     brokerURL: '/ws-telemetry',
 *     connectHeaders: { Authorization: 'Bearer ' + jwtToken },
 *     ...
 *   })
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketSecurityConfig implements WebSocketMessageBrokerConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebSocketSecurityConfig.class);

    private final JwtDecoder jwtDecoder;

    public WebSocketSecurityConfig(JwtDecoder jwtDecoder) {
        this.jwtDecoder = jwtDecoder;
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {

            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor =
                        MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

                if (accessor == null || accessor.getCommand() == null) {
                    return message;
                }

                // Validar apenas no CONNECT — depois a Principal fica associada a sessao
                if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                    String authorization = accessor.getFirstNativeHeader("Authorization");
                    if (authorization == null || !authorization.startsWith("Bearer ")) {
                        log.warn("STOMP CONNECT rejeitado: sem header Authorization Bearer");
                        throw new SecurityException("STOMP: token JWT obrigatorio no CONNECT");
                    }

                    String token = authorization.substring(7);
                    try {
                        Jwt jwt = jwtDecoder.decode(token);
                        AbstractAuthenticationToken auth =
                                new UsernamePasswordAuthenticationToken(
                                        jwt.getClaimAsString("preferred_username"),
                                        null,
                                        extractRoles(jwt));
                        accessor.setUser(auth);
                        log.debug("STOMP CONNECT autenticado: user={}", jwt.getClaimAsString("preferred_username"));
                    } catch (Exception e) {
                        log.warn("STOMP CONNECT rejeitado: JWT invalido ({})", e.getClass().getSimpleName());
                        throw new SecurityException("STOMP: JWT invalido", e);
                    }
                }
                return message;
            }
        });
    }

    @SuppressWarnings("unchecked")
    private Collection<GrantedAuthority> extractRoles(Jwt jwt) {
        Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
        if (realmAccess == null) return Collections.emptyList();
        List<String> roles = (List<String>) realmAccess.get("roles");
        if (roles == null) return Collections.emptyList();
        return roles.stream()
                .map(r -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + r))
                .toList();
    }
}
