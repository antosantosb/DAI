package dai.tub.pgu.ai;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.InMemoryChatMemory;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.AiInteractionLog;
import dai.tub.pgu.repository.AiInteractionLogRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

@Service
public class AiChatService {

    private static final Logger log = LoggerFactory.getLogger(AiChatService.class);

    private final ChatClient chatClient;
    private final AiInteractionLogRepository logRepo;
    private final String modelName;
    private final MeterRegistry meterRegistry;
    private final InMemoryChatMemory chatMemory; // Implementação simples em memória

    @Value("${pgu.ai.max-prompt-length:500}")
    private int maxPromptLength;

    public AiChatService(OllamaChatModel chatModel,
                         AiTools aiTools,
                         AiInteractionLogRepository logRepo,
                         MeterRegistry meterRegistry,
                         @Value("${spring.ai.ollama.chat.options.model}") String modelName) {
        this.logRepo = logRepo;
        this.meterRegistry = meterRegistry;
        this.modelName = modelName;
        this.chatMemory = new InMemoryChatMemory(); // Memória simples para o histórico da sessão

        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem(SYSTEM_PROMPT)
                .defaultTools(aiTools)
                .build();
    }

    public ChatResult processChat(String userId, String username, UUID sessionId, String userMessage) {
        // Iniciar métrica de duração
        Timer.Sample sample = Timer.start(meterRegistry);

        // 1. Validação do input
        if (userMessage == null || userMessage.trim().isEmpty()) {
            throw new IllegalArgumentException("Mensagem vazia");
        }
        if (userMessage.length() > maxPromptLength) {
            throw new IllegalArgumentException("Mensagem excede " + maxPromptLength + " caracteres");
        }
        if (containsSuspiciousPattern(userMessage)) {
            persistLog(userId, username, sessionId, userMessage, null, 0,
                    AiInteractionLog.Status.REJECTED, "Padrão suspeito detectado", 0);
            meterRegistry.counter("ai.query.total", "status", "rejected").increment();
            throw new IllegalArgumentException("Padrão suspeito detectado na pergunta");
        }

        // 2. Persistir log com estado PENDING
        AiInteractionLog logEntry = persistLog(userId, username, sessionId, userMessage, null, 0,
                AiInteractionLog.Status.PENDING, null, 0);

        Instant start = Instant.now();
        try {
            // 3. Chamar o Ollama com o advisor de memória (para manter contexto da conversa)
            ChatResponse response = chatClient.prompt()
                    .user(userMessage)
                    .advisors(new MessageChatMemoryAdvisor(chatMemory, sessionId.toString(), 10)) // retém últimas 10 mensagens
                    .call()
                    .chatResponse();

            long latencyMs = Duration.between(start, Instant.now()).toMillis();
            String responseText = response.getResult().getOutput().getText();
            List<String> toolsCalled = extractToolsCalled(response);

            // 4. Registar métricas de sucesso
            sample.stop(Timer.builder("ai.query.duration")
                    .tag("status", "success")
                    .register(meterRegistry));
            meterRegistry.counter("ai.query.total", "status", "success").increment();
            toolsCalled.forEach(tool ->
                    meterRegistry.counter("ai.tool.invocations", "tool", tool).increment());

            // 5. Atualizar log com sucesso
            updateLog(logEntry.getId(), AiInteractionLog.Status.SUCCESS,
                    responseText, toolsCalled, (int) latencyMs, null);

            return new ChatResult(responseText, toolsCalled, latencyMs);

        } catch (Exception e) {
            long latencyMs = Duration.between(start, Instant.now()).toMillis();
            log.error("Erro ao processar chat: {}", e.getMessage(), e);

            // Registar métricas de erro
            sample.stop(Timer.builder("ai.query.duration")
                    .tag("status", "error")
                    .register(meterRegistry));
            meterRegistry.counter("ai.query.total", "status", "error").increment();

            updateLog(logEntry.getId(), AiInteractionLog.Status.ERROR,
                    null, List.of(), (int) latencyMs, e.getMessage());
            throw new RuntimeException("Erro ao processar pergunta IA", e);
        }
    }

    
    public record ToolUsage(String name, long count) {}

    public long countInteractionsLast24h() {
        Instant since = Instant.now().minus(24, ChronoUnit.HOURS);
        return logRepo.countByCreatedAtAfter(since);
    }

    public double averageLatencyLast24h() {
        Instant since = Instant.now().minus(24, ChronoUnit.HOURS);
        Double avg = logRepo.averageLatencySince(since);
        return avg != null ? avg : 0.0;
    }

    public List<ToolUsage> topToolsLast24h() {
        Instant since = Instant.now().minus(24, ChronoUnit.HOURS);
        List<Object[]> results = logRepo.findTopToolsLast24h(since);
        return results.stream()
            .map(row -> new ToolUsage((String) row[0], ((Number) row[1]).longValue()))
            .collect(Collectors.toList());
    }

    // ==================== HELPERS ====================

    private boolean containsSuspiciousPattern(String prompt) {
        String lower = prompt.toLowerCase();
        return lower.contains("ignore previous instructions")
                || lower.contains("ignore all previous")
                || lower.contains("system prompt")
                || lower.contains("you are now")
                || lower.matches(".*select\\s+\\*.*from.*")
                || lower.matches(".*drop\\s+table.*");
    }

    private AiInteractionLog persistLog(String userId, String username, UUID sessionId,
                                        String prompt, String response, int toolsCallCount,
                                        AiInteractionLog.Status status, String errorMsg, long latencyMs) {
        AiInteractionLog entry = new AiInteractionLog();
        entry.setUserId(userId);
        entry.setUsername(username);
        entry.setSessionId(sessionId);
        entry.setPrompt(prompt);
        entry.setPromptLength(prompt.length());
        entry.setPromptHash(sha256(prompt));
        entry.setToolsCallCount(toolsCallCount);
        entry.setResponseSummary(response != null ? truncate(response, 500) : null);
        entry.setResponseLength(response != null ? response.length() : null);
        entry.setLatencyMs((int) latencyMs);
        entry.setModelName(modelName);
        entry.setStatus(status);
        entry.setErrorMessage(errorMsg);
        return logRepo.save(entry);
    }

    private void updateLog(Long id, AiInteractionLog.Status status, String response,
                           List<String> toolsCalled, int latencyMs, String errorMsg) {
        logRepo.findById(id).ifPresent(entry -> {
            entry.setStatus(status);
            entry.setResponseSummary(response != null ? truncate(response, 500) : null);
            entry.setResponseLength(response != null ? response.length() : null);
            entry.setToolsCalled(toolsCalled);
            entry.setToolsCallCount(toolsCalled.size());
            entry.setLatencyMs(latencyMs);
            entry.setErrorMessage(errorMsg);
            logRepo.save(entry);
        });
    }

   private List<String> extractToolsCalled(ChatResponse response) {
        var toolCalls = response.getResult().getOutput().getToolCalls();
        if (toolCalls == null) return List.of();
        List<String> names = new ArrayList<>();
        for (var tc : toolCalls) {
            try {
                // Tenta getName() primeiro
                String name = (String) tc.getClass().getMethod("getName").invoke(tc);
                names.add(name);
            } catch (Exception e) {
                names.add("unknown");
            }
        }
        return names;
    }

    private String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "ERROR";
        }
    }

    private String truncate(String s, int maxLen) {
        return s.length() <= maxLen ? s : s.substring(0, maxLen);
    }

    public record ChatResult(String response, List<String> toolsCalled, long latencyMs) {}

    // ==================== SYSTEM PROMPT ====================
    private static final String SYSTEM_PROMPT = """
        És um assistente operacional dos Transportes Urbanos de Braga (TUB).
        Respondes em português europeu, breve e técnico.

        Tens acesso a um conjunto de ferramentas (tools) para consultar dados operacionais.
        REGRAS ABSOLUTAS:
        1. Usa as ferramentas SEMPRE que precisares de dados em tempo real ou históricos.
        2. NUNCA inventes valores numéricos, datas, ou nomes.
        3. NUNCA forneças identificação pessoal (nomes, emails, telefones).
        4. Se uma pergunta não pode ser respondida com as ferramentas disponíveis,
           diz CLARAMENTE: "Não tenho dados para responder a essa pergunta."
        5. Se a pergunta envolver dados pessoais, recusa educadamente.
        6. Responde de forma concisa e fundamentada nos dados retornados pelas ferramentas.
        7. Quando apresentares estatísticas, indica o período/contexto.

        Estás a servir o Gestor / Analista de Dados dos TUB.
        """;
}