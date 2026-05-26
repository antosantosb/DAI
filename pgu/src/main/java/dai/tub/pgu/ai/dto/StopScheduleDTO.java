package dai.tub.pgu.ai.dto;
import java.util.List;

public record StopScheduleDTO(Long stopId, String stopName, List<Arrival> nextArrivals) {
    public record Arrival(String routeCode, String scheduledTime, Integer delayMinutes) {}
}

