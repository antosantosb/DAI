package dai.tub.pgu.audit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.OffsetDateTime;

/**
 * Sprint 0 (F2): regista cada chamada HTTP na tabela {@code api_access_log}.
 *
 * <p>Skipa:
 * <ul>
 *   <li>{@code /actuator/**} (health checks dos Docker, Prometheus scraping)</li>
 *   <li>{@code /favicon.ico}, {@code /static/**}, {@code /assets/**}</li>
 *   <li>WebSockets (handshake e' GET mas frames depois nao passam pelo filter)</li>
 * </ul>
 *
 * <p>O insert e' delegado ao {@link ApiAccessLogService} via {@code @Async}
 * para nao bloquear a thread do request.
 *
 * <p>Ordem: corre apos a Spring Security (para conseguir extrair o user
 * autenticado do {@link SecurityContextHolder}).
 */
@Component
@RequiredArgsConstructor
@Order(Ordered.LOWEST_PRECEDENCE)
public class ApiAccessLogFilter extends OncePerRequestFilter {

    private final ApiAccessLogService service;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path == null) return false;
        return path.startsWith("/actuator")
                || path.startsWith("/static")
                || path.startsWith("/assets")
                || path.startsWith("/ws-")            // WebSocket handshake (Sprint -1 SEC-4)
                || path.equals("/favicon.ico");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        long start = System.nanoTime();
        try {
            chain.doFilter(request, response);
        } finally {
            long latencyMs = (System.nanoTime() - start) / 1_000_000L;
            try {
                ApiAccessLog entry = ApiAccessLog.builder()
                        .ts(OffsetDateTime.now())
                        .ip(clientIp(request))
                        .username(currentUsername())
                        .method(request.getMethod())
                        .path(truncate(request.getRequestURI(), 512))
                        .query(truncate(request.getQueryString(), 2048))
                        .status(response.getStatus())
                        .latencyMs((int) Math.min(latencyMs, Integer.MAX_VALUE))
                        .userAgent(truncate(request.getHeader("User-Agent"), 255))
                        .build();
                service.logAsync(entry);
            } catch (Exception e) {
                // Audit nunca parte o request.
                logger.warn("Falha a montar entry de audit: " + e.getMessage());
            }
        }
    }

    private static String clientIp(HttpServletRequest request) {
        // Nginx faz proxy; X-Forwarded-For tem o IP real (Sprint -1 SEC-6/nginx).
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return (comma > 0 ? xff.substring(0, comma) : xff).trim();
        }
        return request.getRemoteAddr();
    }

    private static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return null;
        String name = auth.getName();
        return "anonymousUser".equals(name) ? null : name;
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
