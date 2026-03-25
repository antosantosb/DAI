package dai.tub.pgu.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig
{
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception
    {
        http
            .csrf(csrf -> csrf.disable())

            .authorizeHttpRequests(auth -> auth
                // Documentação da API (Swagger)
                .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                // WebSocket — o Frontend liga-se aqui para telemetria em tempo real
                .requestMatchers("/ws-telemetry/**").permitAll()
                // Endpoint de ingestão — acessível apenas via rede interna (etl_net)
                .requestMatchers(HttpMethod.POST, "/api/v1/telemetry/ingest").permitAll()
                // Zero Trust: tudo o resto exige token JWT do Keycloak
                .anyRequest().authenticated()
            )

            .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> {}));

        return http.build();
    }
}
