package dai.tub.pgu.dto;

public class AnalyticsDTOs {

    public record FleetOccupancyData(
            String minute,
            long totalPassengers,
            long activeBuses
    ) {}

    public record RouteDelayData(
            String routeCode,
            String status,
            long statusCount
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
