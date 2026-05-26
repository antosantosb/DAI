package dai.tub.pgu.ai.dto;
import java.util.List;


public record MonitoringStatsDTO(long queriesToday, long queriesThisWeek, double avgLatencyMs,
                              double errorRate, List<ToolUsage> topTools) {
    public record ToolUsage(String name, long count) {}
}