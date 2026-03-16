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
            .csrf(csrf -> csrf.disable()) // Desativa CSRF para testes de API
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/telemetry/**").permitAll() // LIBERTA A API
                .anyRequest().authenticated()
            );
        return http.build();
    }
}
