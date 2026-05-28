package dai.tub.pgu.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig
{
    private final InternalApiKeyFilter internalApiKeyFilter;

    public SecurityConfig(InternalApiKeyFilter internalApiKeyFilter)
    {
        this.internalApiKeyFilter = internalApiKeyFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception
    {
        http
            .addFilterBefore(internalApiKeyFilter, BearerTokenAuthenticationFilter.class)
            .cors(cors -> cors.configurationSource(corsSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // WebSocket endpoint — público (STOMP auth é concern separado)
                .requestMatchers("/ws-telemetry/**").permitAll()
                // Painel de bordo — motorista autenticado com role 'motorista'
                .requestMatchers(HttpMethod.GET, "/api/v1/drivers/me/**").hasRole("motorista")
                .requestMatchers(HttpMethod.GET, "/api/v1/buses/code/**").hasAnyRole("motorista", "admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/despacho/*/mensagens/motorista").hasRole("motorista")
                .requestMatchers(HttpMethod.POST, "/api/v1/ocorrencias/motorista").hasRole("motorista")
                // Actuator
                .requestMatchers("/actuator/**").permitAll()
                // Swagger / SpringDoc
                .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                // Despacho Operacional — Mensagens CM
                .requestMatchers(HttpMethod.POST, "/api/v1/despacho/*/mensagens").hasAnyRole("funcionario", "admin", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/despacho/*/mensagens/*/reenviar").hasAnyRole("funcionario", "admin", "developer")
                .requestMatchers(HttpMethod.GET, "/api/v1/despacho/**").hasAnyRole("funcionario", "admin", "motorista", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/despacho/*/ack").permitAll() // protegido pelo filtro de API key
                // Sprint 0 (F4): DataSources — pulse e' machine-to-machine (API key),
                // CRUD e' admin-only.
                .requestMatchers(HttpMethod.POST, "/api/v1/data-sources/*/pulse").permitAll() // protegido pelo filtro de API key
                .requestMatchers(HttpMethod.POST, "/api/v1/data-sources/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.PUT, "/api/v1/data-sources/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/data-sources/**").hasAnyRole("admin", "developer")
                // Leituras — qualquer utilizador autenticado
                .requestMatchers(HttpMethod.GET, "/api/v1/**").authenticated()
                // Ocorrências — Gestão e Escritas
                .requestMatchers(HttpMethod.POST, "/api/v1/ocorrencias/*/assumir").hasAnyRole("maintenance", "admin", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/ocorrencias/*/fechar").hasAnyRole("maintenance", "admin", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/ocorrencias/*/acao-corretiva").hasAnyRole("maintenance", "admin", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/ocorrencias/*/falso-positivo").hasAnyRole("maintenance", "funcionario", "admin", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/ocorrencias/*/anexos").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/v1/ocorrencias").hasAnyRole("maintenance", "funcionario", "admin", "developer")
                .requestMatchers("/api/v1/ocorrencias/**").authenticated()
                // Exportações — qualquer utilizador autenticado pode submeter
                .requestMatchers(HttpMethod.POST, "/api/v1/exports/**").authenticated()
                // Self-service de conta — qualquer utilizador autenticado.
                // TEM de vir antes de /api/v1/users/** (admin-only) porque
                // /api/v1/me partilha o prefixo /api/v1.
                .requestMatchers("/api/v1/me/**").authenticated()
                .requestMatchers("/api/v1/me").authenticated()
                // Sprint 1 follow-up: batch generation (buses + motoristas) sao
                // ferramentas de demo — restritas a role `developer`. Tem de vir
                // ANTES dos matchers genericos /api/v1/users/** e /api/v1/buses/**
                // (admin-only), senao o admin tambem ganhava acesso.
                .requestMatchers(HttpMethod.POST, "/api/v1/users/drivers/batch").hasRole("developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/batch").hasRole("developer")
                // Gestão de utilizadores — apenas admin
                .requestMatchers("/api/v1/users/**").hasAnyRole("admin", "developer")
                // Escrita em recursos de gestão — apenas admin
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/**").hasAnyRole("admin", "developer")

                .requestMatchers(HttpMethod.PUT, "/api/v1/buses/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.PATCH, "/api/v1/buses/**").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/buses/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/stops/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.PUT, "/api/v1/stops/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/stops/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/routes/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.PUT, "/api/v1/routes/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/routes/**").hasAnyRole("admin", "developer")
                // Apagar exportações — apenas admin
                .requestMatchers(HttpMethod.DELETE, "/api/v1/exports/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.PUT, "/api/v1/config/**").hasAnyRole("admin", "developer")
                // AI / Chatbot: admin ou funcionario (operador foi renomeado em Sprint 1 F0)
                .requestMatchers(HttpMethod.POST, "/api/v1/ai/**").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.GET, "/api/v1/ai/**").hasAnyRole("admin", "funcionario", "developer")

                // Sprint 1 follow-up: Ferramentas Dev / Demo — apenas role "developer"
                .requestMatchers("/api/v1/dev/**").hasRole("developer")

                // Tudo o resto — autenticado
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
            );

        return http.build();
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter()
    {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(new JwtRoleConverter());
        return converter;
    }

    @Bean
    public CorsConfigurationSource corsSource()
    {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(
            "http://localhost:5173",
            "http://localhost",
            "https://localhost",
            "http://localhost:80",
            "https://pgu-tub.switzerlandnorth.cloudapp.azure.com"
        ));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        // SEC-15/NEW-1: setAllowedHeaders("*") + setAllowCredentials(true) é PROIBIDO pela spec CORS.
        // Browsers rejeitam preflight e o header Authorization (JWT) não é enviado em POSTs.
        // Listar headers explicitamente resolve.
        config.setAllowedHeaders(List.of(
            "Authorization",
            "Content-Type",
            "X-API-Key",
            "X-Requested-With",
            "Accept",
            "Origin",
            "Cache-Control"
        ));
        config.setExposedHeaders(List.of("Content-Disposition")); // necessário para downloads de exports
        config.setAllowCredentials(true);
        config.setMaxAge(3600L); // cache do preflight 1h
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
