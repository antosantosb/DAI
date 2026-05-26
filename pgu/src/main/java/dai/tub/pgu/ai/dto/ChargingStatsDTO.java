package dai.tub.pgu.ai.dto;


public record ChargingStatsDTO(String operator, long sessionsCount, double totalKwh,
                            double avgSessionMinutes, double utilizationPct) {}

