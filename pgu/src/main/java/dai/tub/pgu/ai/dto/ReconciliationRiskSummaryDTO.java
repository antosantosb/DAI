package dai.tub.pgu.ai.dto;
import java.util.Map;


public record ReconciliationRiskSummaryDTO(long driversAtRisk, Map<String, Long> flagCounts,
                                        long totalReconciliationsAtRisk) {}
