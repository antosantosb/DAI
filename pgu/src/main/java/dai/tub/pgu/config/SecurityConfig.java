package dai.tub.pgu.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
            // Mantive a desativação do CSRF que o quevin fez (necessário para APIs)
           .csrf(csrf -> csrf.disable())
            
            // regras Zero Trust
           .authorizeHttpRequests(auth -> auth
                // Permite acesso público apenas à documentação da API
               .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                // Zero Trust: EXIGE token do Keycloak para TUDO o resto (incluindo a API do Quevin)
               .anyRequest().authenticated()
            )
            
            // integração com os tokens do Keycloak
           .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> {}));
            
        return http.build();
    }
}
