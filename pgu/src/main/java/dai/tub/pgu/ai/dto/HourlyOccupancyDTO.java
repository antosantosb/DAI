package dai.tub.pgu.ai.dto;

public record HourlyOccupancyDTO(int hourOfDay, double averageOccupancyPct, long observationCount) {}
