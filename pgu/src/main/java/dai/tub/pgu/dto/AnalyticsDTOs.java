package dai.tub.pgu.dto;

public class AnalyticsDTOs {

    public record FleetOccupancyData(
            String minute,
            long totalPassengers,
            long activeBuses
    ) {}

    /**
     * Pivot de estados por rota no dia corrente.
     * Permite barras empilhadas no frontend sem duplicar rótulos do eixo X.
     */
    public record RouteDelayData(
            String routeCode,
            long activeCount,
            long atStopCount,
            long stoppingCount,
            long delayedCount,
            long stoppedCount
    ) {}

    public record HeatmapData(
            double lat,
            double lng,
            int passengerCount
    ) {}

    public record BusEfficiencyData(
            String busId,
            double avgPassengers,
            int maxPassengers
    ) {}
}
