package dai.tub.pgu.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

/**
 * Filtro que permite acesso machine-to-machine (simulador, NiFi)
 * via header X-API-Key, sem necessidade de JWT.
 *
 * Sprint -1 (SEC-2): comparação timing-safe via MessageDigest.isEqual
 *                    para resistir a timing attacks.
 */
@Component
public class InternalApiKeyFilter extends OncePerRequestFilter
{
    private static final String HEADER = "X-API-Key";

    @Value("${pgu.internal.api-key}")
    private String expectedKey;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException
    {
        String key = request.getHeader(HEADER);
        if (key != null && constantTimeEquals(key, expectedKey)
                && SecurityContextHolder.getContext().getAuthentication() == null)
        {
            var auth = new UsernamePasswordAuthenticationToken(
                    "internal-service", null,
                    List.of(new SimpleGrantedAuthority("ROLE_admin")));
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
        filterChain.doFilter(request, response);
    }

    /**
     * Comparação em tempo constante para evitar timing attacks.
     * String.equals() sai cedo no primeiro byte diferente — um atacante mede
     * tempos de resposta e descobre a chave byte a byte.
     */
    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        byte[] ab = a.getBytes(StandardCharsets.UTF_8);
        byte[] bb = b.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(ab, bb);
    }
}
