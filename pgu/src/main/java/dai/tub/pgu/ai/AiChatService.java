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
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dai.tub.pgu.domain.AiInteractionLog;
import dai.tub.pgu.repository.AiInteractionLogRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

@Service
public class AiChatService {

    private static final Logger log = LoggerFactory.getLogger(AiChatService.class);

    private final ChatClient chatClient;
    private final ChatClient chatClientNoTools;
    private final AiInteractionLogRepository logRepo;
    private final String modelName;
    private final MeterRegistry meterRegistry;
    private final InMemoryChatMemory chatMemory; // Implementação simples em memória

    @Value("${pgu.ai.max-prompt-length:500}")
    private int maxPromptLength;

    @Value("${spring.ai.ollama.base-url:http://ollama:11434}")
    private String ollamaBaseUrl;

    // HTTP client + Jackson, usados pela versao streaming directa ao Ollama.
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final ObjectMapper objectMapper = new ObjectMapper();

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
        // Fallback sem tools — usado quando o modelo (Gemma 2 2B é fraco em
        // tool calling) decide nao invocar nenhuma tool e o Spring AI 1.0.0-M6
        // crasha com NPE "OllamaApi$ChatResponse.message() is null".
        this.chatClientNoTools = ChatClient.builder(chatModel)
                .defaultSystem(SYSTEM_PROMPT)
                .build();
    }

    /**
     * Sprint 7 (follow-up): warm-up no arranque. Dispara uma query trivial ao
     * Ollama logo apos a app ficar pronta, para forcar o carregamento do modelo
     * para a RAM. Sem isto, o primeiro utilizador a abrir o chatbot espera
     * 30-90s (cold start do Qwen 2.5 3B em CPU); com warm-up, a 1a query real
     * ja' tem o modelo residente e responde em poucos segundos.
     * Combinado com OLLAMA_KEEP_ALIVE=-1 (no docker-compose), o modelo nunca
     * sai da RAM durante a vida do container.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Async
    public void warmupModel() {
        try {
            log.info("[ai-warmup] iniciando carregamento do modelo {} ...", modelName);
            Instant start = Instant.now();
            chatClientNoTools.prompt()
                .user("ok")
                .call()
                .chatResponse();
            log.info("[ai-warmup] modelo carregado em {} ms",
                Duration.between(start, Instant.now()).toMillis());
        } catch (Exception e) {
            log.warn("[ai-warmup] falhou (nao bloqueia o startup): {}", e.getMessage());
        }
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
            // 3. Chamar o Ollama com o advisor de memória (para manter contexto da conversa).
            //    O caminho preferido inclui defaultTools(aiTools) — permite ao modelo
            //    consultar dados em tempo real via tool calling.
            ChatResponse response;
            List<String> toolsCalled;
            try {
                response = chatClient.prompt()
                        .user(userMessage)
                        .advisors(new MessageChatMemoryAdvisor(chatMemory, sessionId.toString(), 10))
                        .call()
                        .chatResponse();
                toolsCalled = extractToolsCalled(response);
            } catch (Exception toolsFail) {
                // Workaround Spring AI 1.0.0-M6 + Ollama: tool calling com
                // modelos pequenos (Gemma 2 2B) e' instavel — pode dar NPE
                // (message=null), bad request, ou timeout. Fallback para
                // cliente sem tools garante que o user tem sempre resposta.
                log.warn("Tool calling falhou ({}: {}), retry sem tools",
                         toolsFail.getClass().getSimpleName(), toolsFail.getMessage());
                response = chatClientNoTools.prompt()
                        .user(userMessage)
                        .advisors(new MessageChatMemoryAdvisor(chatMemory, sessionId.toString(), 10))
                        .call()
                        .chatResponse();
                toolsCalled = List.of();
            }

            long latencyMs = Duration.between(start, Instant.now()).toMillis();
            String responseText = response.getResult().getOutput().getText();

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

    
    /**
     * Sprint 7 (follow-up): variante streaming token-a-token via SseEmitter.
     * Em vez de usar chatClient.stream() do Spring AI (que requer Project
     * Reactor no classpath e tem bugs conhecidos em 1.0.0-M6), chama o
     * endpoint /api/chat do Ollama directamente com {"stream":true}. O
     * Ollama devolve NDJSON: uma linha JSON por token (~{"message":{"content":"o"}}).
     * Cada linha vira um evento SSE "token" para o cliente.
     *
     * Tools desactivadas no caminho stream: a resposta vem do conhecimento
     * geral do modelo, sem consultar dados reais (ganho de velocidade
     * percepcionada vs perda de tool-calling).
     */
    @Async
    public void processChatStream(String userId, String username, UUID sessionId,
                                  String userMessage, SseEmitter emitter) {
        // Validacoes basicas
        if (userMessage == null || userMessage.isBlank()) {
            try { emitter.send(SseEmitter.event().name("error").data("Mensagem vazia")); emitter.complete(); }
            catch (Exception ignore) {}
            return;
        }
        if (userMessage.length() > maxPromptLength) {
            try { emitter.send(SseEmitter.event().name("error").data("Mensagem excede " + maxPromptLength + " caracteres")); emitter.complete(); }
            catch (Exception ignore) {}
            return;
        }

        AiInteractionLog logEntry = persistLog(userId, username, sessionId, userMessage, null, 0,
                AiInteractionLog.Status.PENDING, null, 0);

        Instant start = Instant.now();
        StringBuilder accumulated = new StringBuilder();

        try {
            // Construir payload Ollama /api/chat
            String payload = objectMapper.writeValueAsString(java.util.Map.of(
                    "model", modelName,
                    "stream", true,
                    "messages", List.of(
                            java.util.Map.of("role", "system", "content", SYSTEM_PROMPT),
                            java.util.Map.of("role", "user", "content", userMessage)
                    ),
                    "options", java.util.Map.of(
                            "temperature", 0.2,
                            "top_p", 0.9,
                            "num_ctx", 2048,
                            "num_predict", 256
                    )
            ));

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(ollamaBaseUrl + "/api/chat"))
                    .timeout(Duration.ofSeconds(180))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();

            HttpResponse<java.io.InputStream> response = httpClient.send(req, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                throw new RuntimeException("Ollama HTTP " + response.statusCode());
            }

            // NDJSON parser: cada linha e' um objecto { "message": {"content": "..."}, "done": false/true }
            try (BufferedReader br = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    if (line.isBlank()) continue;
                    JsonNode node = objectMapper.readTree(line);
                    JsonNode msg = node.get("message");
                    if (msg != null && msg.has("content")) {
                        String chunk = msg.get("content").asText();
                        if (!chunk.isEmpty()) {
                            accumulated.append(chunk);
                            try {
                                emitter.send(SseEmitter.event().name("token").data(chunk));
                            } catch (Exception e) {
                                log.debug("SSE send falhou (cliente desconectado?): {}", e.getMessage());
                                return; // cliente desligou — desiste
                            }
                        }
                    }
                    if (node.has("done") && node.get("done").asBoolean()) break;
                }
            }

            long latencyMs = Duration.between(start, Instant.now()).toMillis();
            String fullText = accumulated.toString();
            try {
                emitter.send(SseEmitter.event().name("done").data("{\"latencyMs\":" + latencyMs + "}"));
                emitter.complete();
            } catch (Exception ignore) {}
            updateLog(logEntry.getId(), AiInteractionLog.Status.SUCCESS,
                    fullText, List.of(), (int) latencyMs, null);
            meterRegistry.counter("ai.query.total", "status", "success", "mode", "stream").increment();
        } catch (Exception e) {
            long latencyMs = Duration.between(start, Instant.now()).toMillis();
            log.error("Erro ao streamar chat: {}", e.getMessage(), e);
            try {
                emitter.send(SseEmitter.event().name("error").data(e.getMessage() != null ? e.getMessage() : "Erro"));
                emitter.complete();
            } catch (Exception ignore) {}
            updateLog(logEntry.getId(), AiInteractionLog.Status.ERROR,
                    null, List.of(), (int) latencyMs, e.getMessage());
            meterRegistry.counter("ai.query.total", "status", "error", "mode", "stream").increment();
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
        És o assistente operacional dos Transportes Urbanos de Braga (TUB).
        Respondes em português europeu, breve e técnico.

        # FERRAMENTAS DISPONÍVEIS (USA-AS!)
        Tens acesso a estas funções para consultar dados reais. Quando o utilizador
        pergunta qualquer coisa que possa ser respondida por uma destas funções, CHAMA-A:

        - getFleetOccupancyByHour(dateFrom, dateTo) → ocupação média por hora
        - getDelayStats(routeId, dateFrom, dateTo) → atrasos por linha
        - getActiveAlerts(severityMin) → alertas activos da frota
        - getStopSchedule(stopId) → próximas chegadas numa paragem
        - getEnergyConsumptionStats(dateFrom, dateTo) → consumo energético
        - getChargerUtilization(dateFrom, dateTo, operator) → utilização carregadores
        - getHeadwayStats(routeId) → headway (intervalo entre passagens) por linha
        - getOcorrenciasOpenCount(prioridade, tipoAtivo) → ocorrências abertas
        - getTopProblematicVehicles(windowDays) → veículos com mais ocorrências
        - getServiceAlerts(activeOnly) → service alerts
        - getReconciliacoes(windowDays) → reconciliações financeiras

        # REGRAS ABSOLUTAS
        1. Para QUALQUER pergunta sobre números, datas, estatísticas, listas ou estado
           operacional, CHAMA uma das ferramentas acima. Não respondas do teu conhecimento.
        2. NUNCA inventes valores numéricos, datas, IDs, ou nomes.
        3. NUNCA forneças identificação pessoal (nomes, emails, telefones).
        4. Se NENHUMA ferramenta da lista cobre a pergunta, responde:
           "Não tenho ferramenta disponível para responder a essa pergunta específica."
        5. Quando apresentares números devolvidos por uma tool, indica o período/contexto.
        6. Resposta máxima: 4 frases. Sê directo.

        # EXEMPLOS (segue este padrão)

        Exemplo 1:
        User: Quais foram os atrasos médios da linha 5 esta semana?
        [Tu chamas: getDelayStats(routeId=5, dateFrom="2026-05-25", dateTo="2026-06-01")]
        Tu: A linha 5 teve um atraso médio de 3.2 min entre 25/05 e 01/06, com pico
            de 12 min na paragem RECTORADO às 17:30.

        Exemplo 2:
        User: Há alertas críticos agora?
        [Tu chamas: getActiveAlerts(severityMin="CRITICA")]
        Tu: Há 2 alertas críticos activos: TUB-007 com falha de motor em INTERCEDENTE,
            e TUB-012 com sobreaquecimento em GUALTAR.

        Exemplo 3:
        User: Quanto consumimos em eletricidade este mês?
        [Tu chamas: getEnergyConsumptionStats(dateFrom="2026-06-01", dateTo="2026-06-30")]
        Tu: Em Junho de 2026 o consumo total foi 24.5 MWh, dos quais 18% em horário
            de ponta. Custo total estimado: 3.450 €.

        Exemplo 4 (pergunta sem tool disponível):
        User: Quantos motoristas estão em férias hoje?
        Tu: Não tenho ferramenta disponível para responder a essa pergunta específica.

        Hoje é 2026-06-01. Estás a servir o Gestor / Analista de Dados dos TUB.
        """;
}