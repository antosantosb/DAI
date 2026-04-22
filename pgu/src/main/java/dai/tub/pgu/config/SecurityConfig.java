package dai.tub.pgu.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
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
                // Actuator
                .requestMatchers("/actuator/**").permitAll()
                // Swagger / SpringDoc
                .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                // Leituras — qualquer utilizador autenticado
                .requestMatchers(HttpMethod.GET, "/api/v1/**").authenticated()
                // Exportações — qualquer utilizador autenticado pode submeter
                .requestMatchers(HttpMethod.POST, "/api/v1/exports/**").authenticated()
                // Escrita em recursos de gestão — apenas admin
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/**").hasRole("admin")
                .requestMatchers(HttpMethod.PUT, "/api/v1/buses/**").hasRole("admin")
                .requestMatchers(HttpMethod.PATCH, "/api/v1/buses/**").hasAnyRole("admin", "operator")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/buses/**").hasRole("admin")
                .requestMatchers(HttpMethod.POST, "/api/v1/stops/**").hasRole("admin")
                .requestMatchers(HttpMethod.PUT, "/api/v1/stops/**").hasRole("admin")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/stops/**").hasRole("admin")
                .requestMatchers(HttpMethod.POST, "/api/v1/routes/**").hasRole("admin")
                .requestMatchers(HttpMethod.PUT, "/api/v1/routes/**").hasRole("admin")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/routes/**").hasRole("admin")
                // Apagar exportações — apenas admin
                .requestMatchers(HttpMethod.DELETE, "/api/v1/exports/**").hasRole("admin")
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
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
