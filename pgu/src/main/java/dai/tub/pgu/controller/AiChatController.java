package dai.tub.pgu.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import dai.tub.pgu.ai.AiChatService;
import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.domain.AiInteractionLog;
import dai.tub.pgu.repository.AiInteractionLogRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/v1/ai")
public class AiChatController {

    private final AiChatService chatService;

    @Autowired
    private AiInteractionLogRepository logRepo;

    @Value("${pgu.ai.enabled:true}")
    private boolean aiEnabled;

    @Value("${spring.ai.ollama.chat.options.model:qwen2.5:3b}")
    private String modelName;

    public AiChatController(AiChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping("/chat")
    @PreAuthorize("hasAnyRole('admin', 'funcionario', 'developer')")
    @LogActivity(action = "Interagir com IA")
    public ResponseEntity<ChatResponse> chat(
            @Valid @RequestBody ChatRequest request,
            @AuthenticationPrincipal Jwt jwt) {

        if (!aiEnabled) {
            return ResponseEntity.status(503)
                .body(new ChatResponse(null, List.of(), "Serviço IA desativado.", 0));
        }

        // O 'sub' do JWT pode estar ausente em users internos (ex: 'dev').
        // Fallback para 'preferred_username' ou 'unknown' — user_id e' NOT NULL.
        String username = jwt.getClaimAsString("preferred_username");
        String userId = jwt.getSubject();
        if (userId == null || userId.isBlank()) {
            userId = (username != null && !username.isBlank()) ? username : "unknown";
        }
        UUID sessionId = request.sessionId() != null ? request.sessionId() : UUID.randomUUID();

        var result = chatService.processChat(userId, username, sessionId, request.message());

        return ResponseEntity.ok(new ChatResponse(
            sessionId,
            result.toolsCalled(),
            result.response(),
            result.latencyMs()
        ));
    }

    /**
     * Sprint 7 (follow-up): endpoint SSE para streaming token-a-token.
     * O frontend usa fetch + ReadableStream para ir mostrando a resposta
     * conforme o modelo a gera (estilo ChatGPT) — melhora drasticamente a
     * percepcao de velocidade mesmo sem reduzir o tempo total de inferencia.
     * SseEmitter timeout 3 min para acomodar respostas longas em CPU.
     */
    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("hasAnyRole('admin', 'funcionario', 'developer')")
    @LogActivity(action = "Interagir com IA (stream)")
    public ResponseEntity<SseEmitter> chatStream(
            @Valid @RequestBody ChatRequest request,
            @AuthenticationPrincipal Jwt jwt) {

        SseEmitter emitter = new SseEmitter(180_000L); // 3 min

        // Headers que desactivam buffering em proxies (Vite dev, nginx, Cloudflare)
        // e compressao gzip que segura o stream ate ter "chunks" suficientes.
        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.add("X-Accel-Buffering", "no");
        headers.add("Cache-Control", "no-cache, no-transform");
        headers.add("Content-Encoding", "identity");
        headers.setContentType(MediaType.TEXT_EVENT_STREAM);

        if (!aiEnabled) {
            try {
                emitter.send(SseEmitter.event().name("error").data("Serviço IA desativado."));
                emitter.complete();
            } catch (Exception ignore) { /* */ }
            return ResponseEntity.ok().headers(headers).body(emitter);
        }

        String username = jwt.getClaimAsString("preferred_username");
        String userId = jwt.getSubject();
        if (userId == null || userId.isBlank()) {
            userId = (username != null && !username.isBlank()) ? username : "unknown";
        }
        UUID sessionId = request.sessionId() != null ? request.sessionId() : UUID.randomUUID();

        // Delega ao service que faz streaming
        chatService.processChatStream(userId, username, sessionId, request.message(), emitter);
        return ResponseEntity.ok().headers(headers).body(emitter);
    }

    @GetMapping("/status")
    @PreAuthorize("hasAnyRole('admin', 'funcionario', 'developer')")
    public ResponseEntity<StatusResponse> status() {
        return ResponseEntity.ok(new StatusResponse(aiEnabled, modelName, "on-premises"));
    }

    @GetMapping("/monitoring/stats")
    @PreAuthorize("hasAnyRole('admin', 'developer')")
    public ResponseEntity<MonitoringStats> stats() {
        long interactionsLast24h = chatService.countInteractionsLast24h();
        double avgLatencyLast24h = chatService.averageLatencyLast24h();
        List<AiChatService.ToolUsage> topToolsLast24h = chatService.topToolsLast24h();

        return ResponseEntity.ok(new MonitoringStats(interactionsLast24h, avgLatencyLast24h, topToolsLast24h));
    }

    @GetMapping("/monitoring/logs")
    @PreAuthorize("hasAnyRole('admin', 'developer')")
    public Page<AiInteractionLog> logs(Pageable pageable) {
        return logRepo.findAll(pageable);
    }

    // ========== DTOs internos ==========
    public record ChatRequest(
        @NotBlank(message = "Mensagem é obrigatória")
        @Size(max = 500, message = "Mensagem excede 500 caracteres")
        String message,
        UUID sessionId
    ) {}

    public record ChatResponse(UUID sessionId, List<String> toolsUsed,
                                String response, long latencyMs) {}

    public record StatusResponse(boolean enabled, String model, String deployment) {}

    // Usa o ToolUsage do AiChatService, não define um próprio
    public record MonitoringStats(long interactionsLast24h, double avgLatencyLast24h,
                                   List<AiChatService.ToolUsage> topTools) {}
}