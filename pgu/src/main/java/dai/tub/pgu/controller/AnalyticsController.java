package dai.tub.pgu.controller;

import dai.tub.pgu.dto.AnalyticsDTOs.FleetOccupancyData;
import dai.tub.pgu.dto.AnalyticsDTOs.RouteDelayData;
import dai.tub.pgu.dto.AnalyticsDTOs.HeatmapData;
import dai.tub.pgu.dto.AnalyticsDTOs.BusEfficiencyData;
import dai.tub.pgu.dto.AnalyticsDTOs.SpeedOverTimeData;
import dai.tub.pgu.dto.AnalyticsDTOs.CongestionData;
import dai.tub.pgu.service.AnalyticsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/fleet-occupancy")
    public ResponseEntity<List<FleetOccupancyData>> getFleetOccupancy() {
        List<FleetOccupancyData> data = analyticsService.getFleetOccupancy();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/route-delays")
    public ResponseEntity<List<RouteDelayData>> getRouteDelays() {
        List<RouteDelayData> data = analyticsService.getRouteDelays();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/heatmap")
    public ResponseEntity<List<HeatmapData>> getHeatmap() {
        List<HeatmapData> data = analyticsService.getHeatmapData();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/bus-efficiency")
    public ResponseEntity<List<BusEfficiencyData>> getBusEfficiency() {
        List<BusEfficiencyData> data = analyticsService.getBusEfficiency();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/speed-over-time")
    public ResponseEntity<List<SpeedOverTimeData>> getSpeedOverTime() {
        List<SpeedOverTimeData> data = analyticsService.getSpeedOverTime();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/congestion")
    public ResponseEntity<List<CongestionData>> getCongestion() {
        List<CongestionData> data = analyticsService.getCongestion();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }
}
