package org.springframework.boot.autoconfigure.web.client;

import org.springframework.context.annotation.Configuration;

/**
 * Sprint 7 (chatbot IA): stub para Spring AI 1.0.0-M6 que faz
 * {@code @ImportAutoConfiguration(RestClientAutoConfiguration.class)}.
 *
 * <p>Em Spring Boot 4, esta auto-configuracao foi movida para outro modulo
 * ({@code org.springframework.boot.restclient.autoconfigure.*}), por isso o
 * classpath nao a tem no nome antigo. Sem este stub, o backend falha no
 * arranque com {@code ClassNotFoundException}.
 *
 * <p>O bean real (RestClient.Builder) e' fornecido pela auto-config nova de
 * Spring Boot 4. Este stub apenas existe para satisfazer o
 * {@code Class.forName()} do Spring AI starter, e e' um {@code @Configuration}
 * vazio (nao define beans).
 *
 * <p>Pode ser removido quando Spring AI for atualizado para uma versao
 * compativel com Spring Boot 4 (>= 1.1.x previsto para final de 2025).
 */
@Configuration
public class RestClientAutoConfiguration {
}
