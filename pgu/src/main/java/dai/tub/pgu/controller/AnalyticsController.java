package dai.tub.pgu.controller;

import dai.tub.pgu.dto.AnalyticsDTOs.FleetOccupancyData;
import dai.tub.pgu.dto.AnalyticsDTOs.RouteDelayData;
import dai.tub.pgu.dto.AnalyticsDTOs.RouteDelayCorrelation;
import dai.tub.pgu.dto.AnalyticsDTOs.HeatmapData;
import dai.tub.pgu.dto.AnalyticsDTOs.BusEfficiencyData;
import dai.tub.pgu.dto.AnalyticsDTOs.SpeedOverTimeData;
import dai.tub.pgu.dto.AnalyticsDTOs.CongestionData;
import dai.tub.pgu.dto.AnalyticsDTOs.CoverageIndicators;
import dai.tub.pgu.dto.AnalyticsDTOs.OccupancyByRouteHour;
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

    /**
     * Sprint 1 (F6): cruzamento de dados de mobilidade real (R.IVT.10).
     * Lista os eventos operacionais (ocorrencias e alertas) dos autocarros
     * que servem a rota indicada, dentro da janela, para correlacionar com os
     * atrasos da linha.
     */
    @GetMapping("/route-delays/correlations")
    public ResponseEntity<List<RouteDelayCorrelation>> getRouteDelayCorrelations(
            @RequestParam Long routeId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String startHour,
            @RequestParam(required = false) String endHour) {
        List<RouteDelayCorrelation> data = analyticsService.getRouteDelayCorrelations(
                routeId, startDate, endDate, startHour, endHour);
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
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

    /**
     * Sprint 2 (Vertical 3.4, R.ICP.04): ocupacao media por rota e hora-do-dia
     * (onboard/capacidade). Mesmos filtros opcionais data/hora dos irmaos.
     * Alimenta o dashboard de ocupacao.
     */
    @GetMapping("/occupancy")
    public ResponseEntity<List<OccupancyByRouteHour>> getOccupancy(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String startHour,
            @RequestParam(required = false) String endHour) {
        List<OccupancyByRouteHour> data = analyticsService.getOccupancyByRouteHour(startDate, endDate, startHour, endHour);
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    /**
     * Sprint 1 (F5): indicadores de cobertura e frequencia (R.IVT.06).
     *
     * <p>Calculados a partir do horario planeado (modelo Transmodel) e da
     * geometria das paragens, nao da telemetria, pelo que NAO aceitam os
     * filtros de data/hora. Devolve sempre um unico objeto com a cobertura
     * geografica, a frequencia por linha/hora e o tempo de espera por paragem.</p>
     */
    @GetMapping("/coverage")
    public ResponseEntity<CoverageIndicators> getCoverageIndicators() {
        return ResponseEntity.ok(analyticsService.getCoverageIndicators());
    }
}
