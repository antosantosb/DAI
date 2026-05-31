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
                // Inventario de main sensors (gateways de telematica a bordo).
                // admin/funcionario/developer gerem o CRUD e a atribuicao a
                // autocarros (PUT .../assign e .../unassign). O developer herda
                // tudo o que o admin tem. TEM que vir ANTES do catch-all
                // GET /api/v1/** abaixo, senao o GET cairia em authenticated().
                .requestMatchers(HttpMethod.GET, "/api/v1/sensors").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.GET, "/api/v1/sensors/**").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/sensors").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/sensors/**").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.PUT, "/api/v1/sensors/**").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/sensors/**").hasAnyRole("admin", "funcionario", "developer")
                // Sprint 2 (Vertical 3.4): ingestao interna de validacoes de
                // bilhetica (fundacao stub, implementada por outra tarefa). E'
                // machine-to-machine como o telemetry/ingest e o pulse: protegido
                // pelo InternalApiKeyFilter (X-API-Key), nao exige role de user.
                .requestMatchers(HttpMethod.POST, "/api/v1/validations").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/validations/**").permitAll()
                // Sprint 4 (3.2): Vehicle diagnostic — ingest M2M (X-API-Key).
                .requestMatchers(HttpMethod.POST,   "/api/v1/diagnostics/ingest").permitAll()
                // Sprint 3 (3.5): Paineis DMS — heartbeat M2M (X-API-Key).
                .requestMatchers(HttpMethod.POST,   "/api/v1/panels/heartbeat").permitAll()
                .requestMatchers(HttpMethod.POST,   "/api/v1/panels").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.PUT,    "/api/v1/panels/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/panels/**").hasAnyRole("admin", "developer")
                // Sprint 2: activity feed (implementado por outra tarefa).
                // admin/funcionario. TEM que vir ANTES do catch-all GET /api/v1/**.
                .requestMatchers(HttpMethod.GET, "/api/v1/activity").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.GET, "/api/v1/activity/**").hasAnyRole("admin", "funcionario", "developer")
                // Sprint 1 (F1): GeoJSON export aberto (R.BO.01) — tem que vir
                // ANTES do catch-all GET /api/v1/** autenticado abaixo.
                .requestMatchers(HttpMethod.GET, "/api/v1/routes/export.geojson").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/stops/export.geojson").permitAll()
                // Sprint 1 (F3): catalogo DCAT-AP aberto (R.IVT.09, R.INT.10)
                // para harvest pelo dados.gov.pt / Catalogo Nacional.
                .requestMatchers(HttpMethod.GET, "/api/v1/catalog/**").permitAll()
                // Sprint 1 (F7): feed GTFS-Realtime aberto (R.IVT.01/04/07) para
                // apps externas (Google Maps, Transit, Citymapper). TEM que vir
                // ANTES do catch-all GET /api/v1/** autenticado abaixo.
                .requestMatchers(HttpMethod.GET, "/api/v1/gtfs-rt/**").permitAll()
                // Sprint 1 (F8): export NeTEx aberto (R.IVT.02/08/11) para
                // ingestao por autoridades de transporte. TEM que vir ANTES do
                // catch-all GET /api/v1/** autenticado abaixo.
                .requestMatchers(HttpMethod.GET, "/api/v1/netex/**").permitAll()
                // Fase E (E-back-1): gestao da escala (bus_duty). admin/funcionario/developer.
                // TEM de vir ANTES dos matchers genericos /api/v1/buses/** mais a frente,
                // para que o funcionario tambem possa criar/apagar escalas (os matchers
                // genericos abaixo limitam POST/DELETE em /api/v1/buses/** a admin/developer).
                // Fase E (#4a): proxy OSRM para o frontend desenhar deadheads.
                .requestMatchers(HttpMethod.GET, "/api/v1/osrm/**").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/*/duties").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.GET,  "/api/v1/buses/*/duties").hasAnyRole("admin", "funcionario", "developer", "motorista")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/buses/*/duties").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.GET,  "/api/v1/duties").hasAnyRole("admin", "funcionario", "developer")
                .requestMatchers(HttpMethod.GET,  "/api/v1/duties/**").hasAnyRole("admin", "funcionario", "developer")
                // Fase E (E-back-2): operacoes de estado do autocarro. TEM de vir ANTES
                // do matcher generico POST /api/v1/buses/** (admin/developer apenas).
                // start / end: motorista (painel de bordo) + admin/developer (devtools).
                // arrived / duties/*/complete / duties-complete: m2m via X-API-Key.
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/*/start").hasAnyRole("motorista", "admin", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/*/end").hasAnyRole("motorista", "admin", "developer")
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/*/arrived").permitAll() // protegido pelo InternalApiKeyFilter
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/*/in-service").permitAll() // idem (STARTING -> EM_SERVICO)
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/*/duties/*/complete").permitAll() // idem
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/*/duties-complete").permitAll() // idem
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
                // Gestão de utilizadores — apenas admin (GET disponível para operadores/manutenção verem a lista)
                .requestMatchers(HttpMethod.GET, "/api/v1/users").hasAnyRole("admin", "developer", "operator", "funcionario", "maintenance")
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
                // Sprint 1 (F0): Operadores de transporte (R.IVT.03)
                .requestMatchers(HttpMethod.POST, "/api/v1/operators/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.PATCH, "/api/v1/operators/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.PUT, "/api/v1/operators/**").hasAnyRole("admin", "developer")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/operators/**").hasAnyRole("admin", "developer")
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
