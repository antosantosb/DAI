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
import org.springframework.web.bind.annotation.RequestParam;
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
    public ResponseEntity<List<FleetOccupancyData>> getFleetOccupancy(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String startHour,
            @RequestParam(required = false) String endHour) {
        List<FleetOccupancyData> data = analyticsService.getFleetOccupancy(startDate, endDate, startHour, endHour);
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/route-delays")
    public ResponseEntity<List<RouteDelayData>> getRouteDelays(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String startHour,
            @RequestParam(required = false) String endHour) {
        List<RouteDelayData> data = analyticsService.getRouteDelays(startDate, endDate, startHour, endHour);
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    /**
     * Sprint 1 (F2): adherence stoplight por rota (R.IVT.06).
     * Classificação verde/amarelo/vermelho com base na percentagem de
     * telemetria com status 'delayed'.
     */
    @GetMapping("/route-adherence")
    public ResponseEntity<List<dai.tub.pgu.dto.AnalyticsDTOs.RouteAdherenceData>> getRouteAdherence(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String startHour,
            @RequestParam(required = false) String endHour) {
        return ResponseEntity.ok(
                analyticsService.getRouteAdherence(startDate, endDate, startHour, endHour));
    }

    @GetMapping("/heatmap")
    public ResponseEntity<List<HeatmapData>> getHeatmap(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String startHour,
            @RequestParam(required = false) String endHour) {
        List<HeatmapData> data = analyticsService.getHeatmapData(startDate, endDate, startHour, endHour);
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/bus-efficiency")
    public ResponseEntity<List<BusEfficiencyData>> getBusEfficiency(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String startHour,
            @RequestParam(required = false) String endHour) {
        List<BusEfficiencyData> data = analyticsService.getBusEfficiency(startDate, endDate, startHour, endHour);
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/speed-over-time")
    public ResponseEntity<List<SpeedOverTimeData>> getSpeedOverTime(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String startHour,
            @RequestParam(required = false) String endHour) {
        List<SpeedOverTimeData> data = analyticsService.getSpeedOverTime(startDate, endDate, startHour, endHour);
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/congestion")
    public ResponseEntity<List<CongestionData>> getCongestion(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String startHour,
            @RequestParam(required = false) String endHour) {
        List<CongestionData> data = analyticsService.getCongestion(startDate, endDate, startHour, endHour);
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }
}
