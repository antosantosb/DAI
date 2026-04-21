package dai.tub.pgu.service;

import dai.tub.pgu.dto.AnalyticsDTOs.FleetOccupancyData;
import dai.tub.pgu.dto.AnalyticsDTOs.RouteDelayData;
import dai.tub.pgu.dto.AnalyticsDTOs.HeatmapData;
import dai.tub.pgu.dto.AnalyticsDTOs.BusEfficiencyData;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AnalyticsService {

    private final JdbcTemplate jdbcTemplate;

    public AnalyticsService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Ocupação da frota, últimos 60 minutos.
     * A view v_fleet_occupancy já filtra janela temporal (2h) e gera rótulo em fuso local.
     */
    public List<FleetOccupancyData> getFleetOccupancy() {
        String sql = """
                SELECT minute_label, total_passengers, active_buses
                FROM v_fleet_occupancy
                ORDER BY minute DESC
                LIMIT 60
                """;

        List<FleetOccupancyData> reversed = jdbcTemplate.query(sql, (rs, rowNum) -> new FleetOccupancyData(
                rs.getString("minute_label"),
                rs.getLong("total_passengers"),
                rs.getLong("active_buses")
        ));
        // inverter → ordem cronológica crescente (esquerda→direita no gráfico)
        java.util.Collections.reverse(reversed);
        return reversed;
    }

    /**
     * Estados operacionais por rota no dia corrente (pivot).
     */
    public List<RouteDelayData> getRouteDelays() {
        String sql = """
                SELECT route_code,
                       active_count, at_stop_count, stopping_count,
                       delayed_count, stopped_count
                FROM v_route_status_delays
                ORDER BY route_code
                """;

        return jdbcTemplate.query(sql, (rs, rowNum) -> new RouteDelayData(
                rs.getString("route_code"),
                rs.getLong("active_count"),
                rs.getLong("at_stop_count"),
                rs.getLong("stopping_count"),
                rs.getLong("delayed_count"),
                rs.getLong("stopped_count")
        ));
    }

    /**
     * Densidade de passageiros agregada em grid ~50m, últimas 2h.
     * Limite defensivo: 5000 células (cardinalidade real é muito menor).
     */
    public List<HeatmapData> getHeatmapData() {
        String sql = """
                SELECT lat, lng, passenger_count
                FROM v_heatmap_passenger_density
                ORDER BY passenger_count DESC
                LIMIT 5000
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new HeatmapData(
                rs.getDouble("lat"),
                rs.getDouble("lng"),
                rs.getInt("passenger_count")
        ));
    }

    /**
     * Eficiência por autocarro (média vs máx de passageiros nas últimas 24h).
     * ORDER BY garante estabilidade das barras entre refreshes.
     */
    public List<BusEfficiencyData> getBusEfficiency() {
        String sql = """
                SELECT bus_id, avg_passengers, max_passengers
                FROM v_avg_passengers_per_bus
                ORDER BY bus_id
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new BusEfficiencyData(
                rs.getString("bus_id"),
                rs.getDouble("avg_passengers"),
                rs.getInt("max_passengers")
        ));
    }
}
