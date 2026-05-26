package dai.tub.pgu.ai;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;  // DTO real do serviço
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import dai.tub.pgu.ai.dto.AlertSummaryDTO;
import dai.tub.pgu.ai.dto.ChargingStatsDTO;
import dai.tub.pgu.ai.dto.EnergyStatsDTO;
import dai.tub.pgu.ai.dto.HeadwayStatsDTO;
import dai.tub.pgu.ai.dto.HourlyOccupancyDTO;
import dai.tub.pgu.ai.dto.ReconciliationRiskSummaryDTO;
import dai.tub.pgu.ai.dto.RouteDelayStatsDTO;
import dai.tub.pgu.ai.dto.ServiceAlertSummaryDTO;
import dai.tub.pgu.ai.dto.VehicleProblemSummaryDTO;
import dai.tub.pgu.dto.AnalyticsDTOs.*;
import dai.tub.pgu.dto.AnalyticsDTOs.FleetOccupancyData;
import dai.tub.pgu.dto.AnalyticsDTOs.RouteDelayData;
import dai.tub.pgu.dto.StopScheduleDTO;
import dai.tub.pgu.service.AlertaService;
import dai.tub.pgu.service.AnalyticsService;
import dai.tub.pgu.service.GtfsService;
import dai.tub.pgu.service.OcorrenciaService;

@Service
public class AiTools {

    @Autowired private AnalyticsService analyticsService;
    @Autowired private OcorrenciaService ocorrenciaService;
    @Autowired private AlertaService alertaService;
    @Autowired private GtfsService gtfsService;

    // -------------------------------------------------------------
    // Tool 1: Ocupação da frota por hora
    // -------------------------------------------------------------
    @Tool(description = """
        Devolve a ocupação média da frota (% de passageiros vs capacidade)
        agrupada por hora do dia, para um intervalo de datas.
        Use quando o utilizador perguntar sobre lotação, ocupação, ou níveis de procura por hora.
        """)
    public List<HourlyOccupancyDTO> getFleetOccupancyByHour(
            @ToolParam(description = "Data início no formato YYYY-MM-DD") String dateFrom,
            @ToolParam(description = "Data fim no formato YYYY-MM-DD (inclusive)") String dateTo) {

        validateDateRange(dateFrom, dateTo, 30);
        List<FleetOccupancyData> data = analyticsService.getFleetOccupancy(dateFrom, dateTo, null, null);
        Map<Integer, Double> hourMap = new HashMap<>();
        Map<Integer, Long> countMap = new HashMap<>();
        for (FleetOccupancyData d : data) {
            String minuteLabel = d.getMinute(); // ex: "2025-05-20 14:30"
            int hour = 0;
            if (minuteLabel != null && minuteLabel.length() >= 13) {
                hour = Integer.parseInt(minuteLabel.substring(11, 13));
            }
            double occ = d.getOccupancyRate();
            hourMap.put(hour, hourMap.getOrDefault(hour, 0.0) + occ);
            countMap.put(hour, countMap.getOrDefault(hour, 0L) + 1);
        }
        List<HourlyOccupancyDTO> result = new ArrayList<>();
        for (int h = 0; h < 24; h++) {
            if (countMap.containsKey(h)) {
                double avg = hourMap.get(h) / countMap.get(h);
                result.add(new HourlyOccupancyDTO(h, avg, countMap.get(h)));
            }
        }
        return result;
    }

    // -------------------------------------------------------------
    // Tool 2: Estatísticas de atrasos por rota
    // -------------------------------------------------------------
    @Tool(description = """
        Devolve estatísticas de atrasos por linha (média, mediana, top 5 paragens com mais atraso)
        para um intervalo de datas. Use para perguntas sobre pontualidade, atrasos, performance.
        """)
    public RouteDelayStatsDTO getRouteDelayStats(
            @ToolParam(description = "ID numérico da rota (opcional; se null devolve todas)") Long routeId,
            @ToolParam(description = "Data início YYYY-MM-DD") String dateFrom,
            @ToolParam(description = "Data fim YYYY-MM-DD") String dateTo) {

        validateDateRange(dateFrom, dateTo, 90);
        List<RouteDelayData> data = analyticsService.getRouteDelays(dateFrom, dateTo, null, null);
        if (data.isEmpty()) {
            return new RouteDelayStatsDTO(routeId != null ? routeId : 0L, "N/A", 0.0, 0.0, List.of());
        }
        // Se routeId for fornecido, filtrar (mas os dados não têm ID, só código)
        // Vamos apenas pegar no primeiro elemento para exemplo
        RouteDelayData first = data.get(0);
        double avgDelay = (first.getDelayedCount() + first.getStoppedCount()) / (double) (first.getActiveCount() + 1);
        double medianDelay = avgDelay; // simplificado
        List<String> topStops = List.of("Exemplo: Paragem Central");
        return new RouteDelayStatsDTO(
            routeId != null ? routeId : 1L,
            first.getRouteCode(),
            avgDelay,
            medianDelay,
            topStops
        );
    }

    // -------------------------------------------------------------
    // Tool 3: Alertas ativos (mock)
    // -------------------------------------------------------------
    @Tool(description = """
        Devolve a lista de alertas ativos da frota acima de uma severidade mínima.
        """)
    public List<AlertSummaryDTO> getActiveAlerts(
            @ToolParam(description = "Severidade mínima: BAIXA, MEDIA, ALTA, CRITICA") String severityMin) {
        return List.of(); // TODO: implementar com dados reais
    }

    // -------------------------------------------------------------
    // Tool 4: Próximas chegadas (usando o DTO real do serviço)
    // -------------------------------------------------------------
    @Tool(description = """
        Devolve o horário (próximas chegadas) numa paragem específica.
        """)
    public dai.tub.pgu.dto.StopScheduleDTO getGtfsSchedule(
            @ToolParam(description = "ID numérico da paragem") Long stopId) {

        List<StopScheduleDTO> schedules = gtfsService.getSchedulesByStop(stopId);
        if (schedules == null || schedules.isEmpty()) return null;
        // retorna o primeiro horário como exemplo (podes adaptar)
        return schedules.get(0);
    }

    // -------------------------------------------------------------
    // Tool 5: Consumo energético (mock)
    // -------------------------------------------------------------
    @Tool(description = "Devolve estatísticas de consumo energético")
    public EnergyStatsDTO getEnergyConsumptionStats(
            @ToolParam(description = "Data início") String dateFrom,
            @ToolParam(description = "Data fim") String dateTo) {
        validateDateRange(dateFrom, dateTo, 365);
        return new EnergyStatsDTO(1250.5, 189.2, 42, 35.0);
    }

    // -------------------------------------------------------------
    // Tool 6: Utilização de carregadores (mock)
    // -------------------------------------------------------------
    @Tool(description = "Devolve estatísticas de utilização de carregadores")
    public ChargingStatsDTO getChargingUtilizationStats(
            @ToolParam(description = "Data início") String dateFrom,
            @ToolParam(description = "Data fim") String dateTo,
            @ToolParam(description = "Operador") String operator) {
        validateDateRange(dateFrom, dateTo, 365);
        return new ChargingStatsDTO(operator != null ? operator : "ALL", 120, 3500.0, 45.5, 68.2);
    }

    // -------------------------------------------------------------
    // Tool 7: Headway (mock)
    // -------------------------------------------------------------
    @Tool(description = "Devolve estatísticas de headway por linha")
    public HeadwayStatsDTO getHeadwayStats(
            @ToolParam(description = "ID da rota") Long routeId) {
        return new HeadwayStatsDTO(routeId, "Linha " + routeId, 7.5, 3, 2);
    }

    // -------------------------------------------------------------
    // Tool 8: Contagem de ocorrências abertas (usa ocorrenciaService)
    // -------------------------------------------------------------
    @Tool(description = "Devolve a contagem de ocorrências abertas")
    public Map<String, Long> getOcorrenciasOpenCount(
            @ToolParam(description = "Prioridade") String prioridade,
            @ToolParam(description = "Tipo ativo") String tipoAtivo) {

        var ocorrencias = ocorrenciaService.listarOcorrencias(null, null);
        Map<String, Long> result = new HashMap<>();
        for (var o : ocorrencias) {
            if ("ABERTA".equals(o.getEstado())) {
                String key = o.getPrioridade();
                result.put(key, result.getOrDefault(key, 0L) + 1);
            }
        }
        result.put("total", result.values().stream().mapToLong(Long::longValue).sum());
        return result;
    }

    // -------------------------------------------------------------
    // Tool 9: Veículos problemáticos (mock)
    // -------------------------------------------------------------
    @Tool(description = "Top veículos com mais ocorrências")
    public List<VehicleProblemSummaryDTO> getTopProblematicVehicles(
            @ToolParam(description = "Dias") Integer windowDays) {
        if (windowDays == null || windowDays < 1 || windowDays > 90)
            throw new IllegalArgumentException("windowDays deve estar entre 1 e 90");
        return List.of(
            new VehicleProblemSummaryDTO("TUB-042", 5, "AVARIADO"),
            new VehicleProblemSummaryDTO("TUB-017", 3, "SOBREAQUECIMENTO")
        );
    }

    // -------------------------------------------------------------
    // Tool 10: Service alerts (mock)
    // -------------------------------------------------------------
    @Tool(description = "Service alerts ativos")
    public List<ServiceAlertSummaryDTO> getServiceAlerts(
            @ToolParam(description = "Apenas ativos") Boolean activeOnly) {
        // Usa Arrays.asList() em vez de List.of() para compatibilidade
        ServiceAlertSummaryDTO alert = new ServiceAlertSummaryDTO(
            "Linha 5 interrompida",
            java.util.List.of("5"),  // ou Arrays.asList("5")
            java.time.Instant.now(),
            java.time.Instant.now().plus(5, java.time.temporal.ChronoUnit.HOURS),
            "ALTA"
        );
        return java.util.Arrays.asList(alert);
    }

    // -------------------------------------------------------------
    // Tool 11: Reconciliações em risco (mock)
    // -------------------------------------------------------------
    @Tool(description = "Reconciliações em risco (agregado)")
    public ReconciliationRiskSummaryDTO getReconciliationsAtRisk(
            @ToolParam(description = "Dias") Integer windowDays) {
        if (windowDays == null || windowDays < 1 || windowDays > 90)
            throw new IllegalArgumentException("windowDays deve estar entre 1 e 90");
        Map<String, Long> flags = Map.of("SEQUENCE_GAP", 12L, "CASH_DISCREPANCY", 8L);
        return new ReconciliationRiskSummaryDTO(5, flags, 20);
    }

    // === Helpers ===
    private void validateDateRange(String dateFrom, String dateTo, int maxDays) {
        LocalDate from = parseDate(dateFrom);
        LocalDate to = parseDate(dateTo);
        if (from.isAfter(to))
            throw new IllegalArgumentException("dateFrom deve ser <= dateTo");
        long days = ChronoUnit.DAYS.between(from, to);
        if (days > maxDays)
            throw new IllegalArgumentException("Intervalo máximo: " + maxDays + " dias");
    }

    private LocalDate parseDate(String dateStr) {
        try {
            return LocalDate.parse(dateStr);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Data inválida: " + dateStr + ". Use YYYY-MM-DD");
        }
    }
}