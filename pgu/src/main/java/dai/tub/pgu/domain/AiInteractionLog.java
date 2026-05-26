package dai.tub.pgu.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "ai_interaction_log")
public class AiInteractionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(length = 255)
    private String username;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String prompt;

    @Column(name = "prompt_length", nullable = false)
    private Integer promptLength;

    @Column(name = "prompt_hash", nullable = false, length = 64)
    private String promptHash;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "tools_called", columnDefinition = "TEXT[]")
    private List<String> toolsCalled;

    @Column(name = "tools_call_count", nullable = false)
    private Integer toolsCallCount = 0;

    @Column(name = "response_summary", columnDefinition = "TEXT")
    private String responseSummary;

    @Column(name = "response_length")
    private Integer responseLength;

    @Column(name = "latency_ms", nullable = false)
    private Integer latencyMs;

    @Column(name = "model_name", nullable = false, length = 64)
    private String modelName;

    @Column(nullable = false, length = 16)
    @Enumerated(EnumType.STRING)
    private Status status;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public enum Status { PENDING, SUCCESS, ERROR, REJECTED, TIMEOUT }

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }
    public void setId(Long id) {
        this.id = id;
    }
    public String getUserId() {
        return userId;
    }
    public void setUserId(String userId) {
        this.userId = userId;
    }
    public String getUsername() {
        return username;
    }
    public void setUsername(String username) {
        this.username = username;
    }
    public UUID getSessionId() {
        return sessionId;
    }
    public void setSessionId(UUID sessionId) {
        this.sessionId = sessionId;
    }
    public String getPrompt() {
        return prompt;
    }
    public void setPrompt(String prompt) {
        this.prompt = prompt;
    }
    public Integer getPromptLength() {
        return promptLength;
    }
    public void setPromptLength(Integer promptLength) {
        this.promptLength = promptLength;
    }
    public String getPromptHash() {
        return promptHash;
    }
    public void setPromptHash(String promptHash) {
        this.promptHash = promptHash;
    }
    public List<String> getToolsCalled() {
        return toolsCalled;
    }
    public void setToolsCalled(List<String> toolsCalled) {
        this.toolsCalled = toolsCalled;
    }
    public Integer getToolsCallCount() {
        return toolsCallCount;
    }
    public void setToolsCallCount(Integer toolsCallCount) {
        this.toolsCallCount = toolsCallCount;
    }
    public String getResponseSummary() {
        return responseSummary;
    }
    public void setResponseSummary(String responseSummary) {
        this.responseSummary = responseSummary;
    }
    public Integer getResponseLength() {
        return responseLength;
    }
    public void setResponseLength(Integer responseLength) {
        this.responseLength = responseLength;
    }
    public Integer getLatencyMs() {
        return latencyMs;
    }
    public void setLatencyMs(Integer latencyMs) {
        this.latencyMs = latencyMs;
    }
    public String getModelName() {
        return modelName;
    }
    public void setModelName(String modelName) {
        this.modelName = modelName;
    }
    public Status getStatus() {
        return status;
    }
    public void setStatus(Status status) {
        this.status = status;
    }
    public String getErrorMessage() {
        return errorMessage;
    }
    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }
    public Instant getCreatedAt() {
        return createdAt;
    }
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
