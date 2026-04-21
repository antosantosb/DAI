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

    public List<FleetOccupancyData> getFleetOccupancy() {
        // Obter as ultimas 60 amostras (minutos) ativas
        String sql = "SELECT TO_CHAR(minute, 'HH24:MI') as min_formatted, total_passengers, active_buses " +
                     "FROM v_fleet_occupancy " +
                     "ORDER BY minute DESC LIMIT 60";

        List<FleetOccupancyData> reversedResults = jdbcTemplate.query(sql, (rs, rowNum) -> new FleetOccupancyData(
                rs.getString("min_formatted"),
                rs.getLong("total_passengers"),
                rs.getLong("active_buses")
        ));

        // Inversao para ficar em ordem cronologica normal (do mais antigo para o mais recente)
        java.util.Collections.reverse(reversedResults);
        return reversedResults;
    }

    public List<RouteDelayData> getRouteDelays() {
        String sql = "SELECT route_code, status, status_count FROM v_route_status_delays";

        return jdbcTemplate.query(sql, (rs, rowNum) -> new RouteDelayData(
                rs.getString("route_code"),
                rs.getString("status"),
                rs.getLong("status_count")
        ));
    }

    public List<HeatmapData> getHeatmapData() {
        // limitamos a 5000 para nao rebentar com a UI
        String sql = "SELECT ST_Y(location) as lat, ST_X(location) as lng, passenger_count FROM v_heatmap_passenger_density LIMIT 5000";
        return jdbcTemplate.query(sql, (rs, rowNum) -> new HeatmapData(
                rs.getDouble("lat"),
                rs.getDouble("lng"),
                rs.getInt("passenger_count")
        ));
    }

    public List<BusEfficiencyData> getBusEfficiency() {
        String sql = "SELECT bus_id, avg_passengers, max_passengers FROM v_avg_passengers_per_bus";
        return jdbcTemplate.query(sql, (rs, rowNum) -> new BusEfficiencyData(
                rs.getString("bus_id"),
                rs.getDouble("avg_passengers"),
                rs.getInt("max_passengers")
        ));
    }
}
