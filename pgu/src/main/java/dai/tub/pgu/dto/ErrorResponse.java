package dai.tub.pgu.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Resposta de erro tipada para todos os erros da API.
 * Estrutura consistente facilita debug no frontend e em logs externos.
 *
 * Sprint -1 (BE-6) — substitui as respostas de erro cruas do Spring.
 */
public record ErrorResponse(
        String code,
        String message,
        Instant timestamp,
        String path,
        String traceId,
        Map<String, String> fieldErrors,
        List<String> details
) {
    public static ErrorResponse of(String code, String message, String path) {
        return new ErrorResponse(code, message, Instant.now(), path, null, null, null);
    }

    public static ErrorResponse of(String code, String message, String path, Map<String, String> fieldErrors) {
        return new ErrorResponse(code, message, Instant.now(), path, null, fieldErrors, null);
    }
}
