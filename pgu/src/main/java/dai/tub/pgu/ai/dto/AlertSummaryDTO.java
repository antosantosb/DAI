package dai.tub.pgu.ai.dto;
import java.time.Instant;

public record AlertSummaryDTO(String severity, String type, String busCode, Instant timestamp) {}
