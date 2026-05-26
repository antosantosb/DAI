package dai.tub.pgu.ai;

import io.github.bucket4j.Bucket;
import io.github.bucket4j.Bandwidth;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;


import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AiRateLimitFilter extends OncePerRequestFilter {

    @Value("${pgu.ai.rate-limit-per-minute:30}")
    private int limitPerMinute;

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws java.io.IOException, jakarta.servlet.ServletException {
        if (!req.getRequestURI().startsWith("/api/v1/ai/chat")) {
            chain.doFilter(req, res);
            return;
        }

        String user = SecurityContextHolder.getContext().getAuthentication().getName();
        Bucket bucket = buckets.computeIfAbsent(user, k -> Bucket.builder()
            .addLimit(Bandwidth.builder()
                .capacity(limitPerMinute)
                .refillIntervally(limitPerMinute, Duration.ofMinutes(1))
                .build())
            .build());

        if (!bucket.tryConsume(1)) {
            res.setStatus(429);
            res.setContentType("application/json");
            res.getWriter().write("""
                {"error":"Rate limit excedido","retry_after":"60s"}
                """);
            return;
        }
        chain.doFilter(req, res);
    }
}

