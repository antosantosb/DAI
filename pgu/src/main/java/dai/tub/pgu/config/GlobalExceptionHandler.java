package dai.tub.pgu.config;

import dai.tub.pgu.dto.ErrorResponse;
import jakarta.persistence.EntityNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Handler global de exceções — Sprint -1 (BE-6).
 *
 * Padroniza respostas de erro em toda a API com {@link ErrorResponse}.
 * Substitui o handling default do Spring (mensagens cruas / stack traces leaked).
 *
 * Códigos de erro convencionais:
 *  - NOT_FOUND       → 404
 *  - VALIDATION      → 400 (com fieldErrors)
 *  - BAD_REQUEST     → 400 (input malformado)
 *  - UNAUTHORIZED    → 401
 *  - FORBIDDEN       → 403
 *  - CONFLICT        → 409 (data integrity)
 *  - PAYLOAD_TOO_LARGE → 413
 *  - INTERNAL        → 500 (catch-all)
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler({EntityNotFoundException.class, NoSuchElementException.class})
    public ResponseEntity<ErrorResponse> handleNotFound(Exception ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of("NOT_FOUND", safeMessage(ex), req.getRequestURI()));
    }

    /**
     * URLs invalidas ou endpoints nao mapeados devolvem 404 limpo
     * (em vez de cair no catch-all e dar 500).
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> handleNoResource(NoResourceFoundException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of("NOT_FOUND", "Recurso nao encontrado.", req.getRequestURI()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest req) {
        Map<String, String> fieldErrors = new HashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(fe ->
                fieldErrors.put(fe.getField(), fe.getDefaultMessage()));
        return ResponseEntity.badRequest()
                .body(ErrorResponse.of("VALIDATION", "Dados inválidos.", req.getRequestURI(), fieldErrors));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraint(ConstraintViolationException ex, HttpServletRequest req) {
        Map<String, String> fieldErrors = new HashMap<>();
        ex.getConstraintViolations().forEach(cv ->
                fieldErrors.put(cv.getPropertyPath().toString(), cv.getMessage()));
        return ResponseEntity.badRequest()
                .body(ErrorResponse.of("VALIDATION", "Dados inválidos.", req.getRequestURI(), fieldErrors));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, IllegalArgumentException.class})
    public ResponseEntity<ErrorResponse> handleBadRequest(Exception ex, HttpServletRequest req) {
        return ResponseEntity.badRequest()
                .body(ErrorResponse.of("BAD_REQUEST", safeMessage(ex), req.getRequestURI()));
    }

    @ExceptionHandler({AuthenticationException.class, BadCredentialsException.class})
    public ResponseEntity<ErrorResponse> handleUnauthorized(Exception ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of("UNAUTHORIZED", "Autenticação necessária ou inválida.", req.getRequestURI()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ErrorResponse.of("FORBIDDEN", "Sem permissão para esta operação.", req.getRequestURI()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleConflict(DataIntegrityViolationException ex, HttpServletRequest req) {
        // Não revelar detalhes SQL (SEC-extra). Log completo só em DEBUG.
        log.debug("DataIntegrityViolation", ex);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of("CONFLICT", "Conflito com dados existentes (ex: duplicado, FK).", req.getRequestURI()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> handleUploadTooLarge(MaxUploadSizeExceededException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(ErrorResponse.of("PAYLOAD_TOO_LARGE", "Ficheiro excede o tamanho máximo permitido.", req.getRequestURI()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex, HttpServletRequest req) {
        HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
        String code = status.is4xxClientError() ? "BAD_REQUEST" : "INTERNAL";
        return ResponseEntity.status(status)
                .body(ErrorResponse.of(code, ex.getReason() != null ? ex.getReason() : safeMessage(ex), req.getRequestURI()));
    }

    /**
     * Catch-all. RuntimeException é usada na codebase como exceção de negócio (legacy).
     * Devolve 400 em vez de 500 para erros de validação de regra.
     */
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ErrorResponse> handleRuntime(RuntimeException ex, HttpServletRequest req) {
        log.warn("Business rule rejected: {}", ex.getClass().getSimpleName());
        // SEC-extra: stack trace completo só em DEBUG (não em INFO/WARN)
        log.debug("Detalhe:", ex);
        return ResponseEntity.badRequest()
                .body(ErrorResponse.of("BUSINESS_RULE", safeMessage(ex), req.getRequestURI()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleAll(Exception ex, HttpServletRequest req) {
        // SEC-extra: nunca devolver mensagem ou stack trace de erros inesperados ao cliente.
        log.error("Erro inesperado em {} {}", req.getMethod(), req.getRequestURI(), ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of("INTERNAL", "Erro interno do servidor.", req.getRequestURI()));
    }

    /**
     * Limita o tamanho e ofusca informação sensível em mensagens de erro.
     * Mensagens muito longas geralmente vêm de stack traces ou queries SQL.
     */
    private String safeMessage(Throwable ex) {
        String msg = ex.getMessage();
        if (msg == null || msg.isBlank()) return ex.getClass().getSimpleName();
        if (msg.length() > 200) return msg.substring(0, 200) + "...";
        return msg;
    }
}
