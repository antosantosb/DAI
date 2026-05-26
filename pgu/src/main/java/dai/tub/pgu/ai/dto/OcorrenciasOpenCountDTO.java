package dai.tub.pgu.ai.dto;
import java.util.Map;

public record OcorrenciasOpenCountDTO(Map<String, Long> counts, long total) {}
