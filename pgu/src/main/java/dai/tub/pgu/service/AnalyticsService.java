package dai.tub.pgu.service;

import dai.tub.pgu.dto.AnalyticsDTOs.FleetOccupancyData;
import dai.tub.pgu.dto.AnalyticsDTOs.RouteDelayData;
import dai.tub.pgu.dto.AnalyticsDTOs.HeatmapData;
import dai.tub.pgu.dto.AnalyticsDTOs.BusEfficiencyData;
import dai.tub.pgu.dto.AnalyticsDTOs.SpeedOverTimeData;
import dai.tub.pgu.dto.AnalyticsDTOs.CongestionData;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AnalyticsService {

    private final JdbcTemplate jdbcTemplate;

    public AnalyticsService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private void appendFilters(StringBuilder sql, List<Object> args, String startDate, String endDate, String startHour, String endHour, String defaultFilter) {
        boolean hasFilter = false;
        if (startDate != null && !startDate.trim().isEmpty()) {
            sql.append(" AND (t.recorded_at AT TIME ZONE 'Europe/Lisbon')::date >= ?::date");
            args.add(startDate.trim());
            hasFilter = true;
        }
        if (endDate != null && !endDate.trim().isEmpty()) {
            sql.append(" AND (t.recorded_at AT TIME ZONE 'Europe/Lisbon')::date <= ?::date");
            args.add(endDate.trim());
            hasFilter = true;
        }
        if (startHour != null && !startHour.trim().isEmpty()) {
            sql.append(" AND (t.recorded_at AT TIME ZONE 'Europe/Lisbon')::time >= ?::time");
            args.add(startHour.trim());
            hasFilter = true;
        }
        if (endHour != null && !endHour.trim().isEmpty()) {
            sql.append(" AND (t.recorded_at AT TIME ZONE 'Europe/Lisbon')::time <= ?::time");
            args.add(endHour.trim());
            hasFilter = true;
        }
        if (!hasFilter && defaultFilter != null) {
            sql.append(" AND ").append(defaultFilter);
        }
    }

    /**
     * Ocupação da frota com filtragem opcional e taxa de ocupação total da frota.
     */
    public List<FleetOccupancyData> getFleetOccupancy(String startDate, String endDate, String startHour, String endHour) {
        StringBuilder sql = new StringBuilder("""
                WITH per_bus_minute AS (
                    SELECT
                        DATE_TRUNC('minute', t.recorded_at)         AS minute,
                        t.bus_id,
                        AVG(t.passenger_count)::numeric             AS avg_pax,
                        COALESCE(MIN(b.capacity), 50)               AS bus_capacity
                    FROM vehicle_telemetry t
                    LEFT JOIN buses b ON t.bus_id = b.bus_code
                    WHERE 1=1
                """);
        List<Object> args = new java.util.ArrayList<>();
        appendFilters(sql, args, startDate, endDate, startHour, endHour, "t.recorded_at >= NOW() - INTERVAL '2 hours'");

        sql.append("""
                    GROUP BY 1, 2
                )
                SELECT
                    minute,
                    TO_CHAR(minute AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS minute_label,
                    ROUND(SUM(avg_pax))::bigint                     AS total_passengers,
                    COUNT(DISTINCT bus_id)                          AS active_buses,
                    CASE 
                        WHEN SUM(bus_capacity) > 0 THEN ROUND(100.0 * SUM(avg_pax) / SUM(bus_capacity), 1)::double precision
                        ELSE 0.0
                    END                                             AS occupancy_rate
                FROM per_bus_minute
                GROUP BY minute
                ORDER BY minute DESC
                """);

        if (args.isEmpty()) {
            sql.append(" LIMIT 60");
        } else {
            sql.append(" LIMIT 500");
        }

        List<FleetOccupancyData> reversed = jdbcTemplate.query(sql.toString(), args.toArray(), (rs, rowNum) -> new FleetOccupancyData(
                rs.getString("minute_label"),
                rs.getLong("total_passengers"),
                rs.getLong("active_buses"),
                rs.getDouble("occupancy_rate")
        ));
        java.util.Collections.reverse(reversed);
        return reversed;
    }

    public List<FleetOccupancyData> getFleetOccupancy() {
        return getFleetOccupancy(null, null, null, null);
    }

    /**
     * Estados operacionais por rota pivot com filtragem opcional.
     */
    public List<RouteDelayData> getRouteDelays(String startDate, String endDate, String startHour, String endHour) {
        StringBuilder sql = new StringBuilder("""
                SELECT
                    r.code                                                      AS route_code,
                    COUNT(*) FILTER (WHERE t.status = 'active')                 AS active_count,
                    COUNT(*) FILTER (WHERE t.status = 'at-stop')                AS at_stop_count,
                    COUNT(*) FILTER (WHERE t.status = 'stopping')               AS stopping_count,
                    COUNT(*) FILTER (WHERE t.status = 'delayed')                AS delayed_count,
                    COUNT(*) FILTER (WHERE t.status = 'stopped')                AS stopped_count
                FROM vehicle_telemetry t
                JOIN buses  b ON t.bus_id   = b.bus_code
                JOIN routes r ON b.route_id = r.id
                WHERE 1=1
                """);
        List<Object> args = new java.util.ArrayList<>();
        appendFilters(sql, args, startDate, endDate, startHour, endHour, "t.recorded_at >= CURRENT_DATE");

        sql.append("""
                GROUP BY r.code
                ORDER BY r.code
                """);

        return jdbcTemplate.query(sql.toString(), args.toArray(), (rs, rowNum) -> new RouteDelayData(
                rs.getString("route_code"),
                rs.getLong("active_count"),
                rs.getLong("at_stop_count"),
                rs.getLong("stopping_count"),
                rs.getLong("delayed_count"),
                rs.getLong("stopped_count")
        ));
    }

    public List<RouteDelayData> getRouteDelays() {
        return getRouteDelays(null, null, null, null);
    }

    /**
     * Densidade de passageiros agregada em grid espacial com filtragem.
     */
    public List<HeatmapData> getHeatmapData(String startDate, String endDate, String startHour, String endHour) {
        StringBuilder sql = new StringBuilder("""
                SELECT
                    ST_Y(ST_SnapToGrid(t.location, 0.0005))   AS lat,
                    ST_X(ST_SnapToGrid(t.location, 0.0005))   AS lng,
                    SUM(t.passenger_count)::int               AS passenger_count
                FROM vehicle_telemetry t
                WHERE t.passenger_count > 0
                """);
        List<Object> args = new java.util.ArrayList<>();
        appendFilters(sql, args, startDate, endDate, startHour, endHour, "t.recorded_at >= NOW() - INTERVAL '2 hours'");

        sql.append("""
                GROUP BY 1, 2
                ORDER BY passenger_count DESC
                LIMIT 5000
                """);

        return jdbcTemplate.query(sql.toString(), args.toArray(), (rs, rowNum) -> new HeatmapData(
                rs.getDouble("lat"),
                rs.getDouble("lng"),
                rs.getInt("passenger_count")
        ));
    }

    public List<HeatmapData> getHeatmapData() {
        return getHeatmapData(null, null, null, null);
    }

    /**
     * Eficiência por autocarro com taxas de ocupação calculadas e filtragem.
     */
    public List<BusEfficiencyData> getBusEfficiency(String startDate, String endDate, String startHour, String endHour) {
        StringBuilder sql = new StringBuilder("""
                SELECT
                    t.bus_id,
                    AVG(t.passenger_count)                          AS avg_passengers,
                    MAX(t.passenger_count)                          AS max_passengers,
                    COALESCE(MIN(b.capacity), 50)                   AS capacity,
                    CASE 
                        WHEN COALESCE(MIN(b.capacity), 50) > 0 THEN ROUND(100.0 * AVG(t.passenger_count) / COALESCE(MIN(b.capacity), 50), 1)::double precision
                        ELSE 0.0
                    END                                             AS avg_occupancy_rate,
                    CASE 
                        WHEN COALESCE(MIN(b.capacity), 50) > 0 THEN ROUND(100.0 * MAX(t.passenger_count) / COALESCE(MIN(b.capacity), 50), 1)::double precision
                        ELSE 0.0
                    END                                             AS max_occupancy_rate
                FROM vehicle_telemetry t
                LEFT JOIN buses b ON t.bus_id = b.bus_code
                WHERE 1=1
                """);
        List<Object> args = new java.util.ArrayList<>();
        appendFilters(sql, args, startDate, endDate, startHour, endHour, "t.recorded_at >= NOW() - INTERVAL '24 hours'");

        sql.append("""
                GROUP BY t.bus_id
                ORDER BY t.bus_id
                """);

        return jdbcTemplate.query(sql.toString(), args.toArray(), (rs, rowNum) -> new BusEfficiencyData(
                rs.getString("bus_id"),
                rs.getDouble("avg_passengers"),
                rs.getInt("max_passengers"),
                rs.getLong("capacity"),
                rs.getDouble("avg_occupancy_rate"),
                rs.getDouble("max_occupancy_rate")
        ));
    }

    public List<BusEfficiencyData> getBusEfficiency() {
        return getBusEfficiency(null, null, null, null);
    }

    /**
     * Velocidade média da frota ao longo do tempo com filtragem.
     */
    public List<SpeedOverTimeData> getSpeedOverTime(String startDate, String endDate, String startHour, String endHour) {
        StringBuilder sql = new StringBuilder("""
                WITH speed_per_minute AS (
                    SELECT
                        DATE_TRUNC('minute', t.recorded_at)         AS minute,
                        AVG(t.speed_kmh)                            AS avg_speed
                    FROM vehicle_telemetry t
                    WHERE 1=1
                """);
        List<Object> args = new java.util.ArrayList<>();
        appendFilters(sql, args, startDate, endDate, startHour, endHour, "t.recorded_at >= NOW() - INTERVAL '2 hours'");

        sql.append("""
                    GROUP BY 1
                )
                SELECT
                    minute,
                    TO_CHAR(minute AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS minute_label,
                    avg_speed
                FROM speed_per_minute
                ORDER BY minute DESC
                """);

        if (args.isEmpty()) {
            sql.append(" LIMIT 60");
        } else {
            sql.append(" LIMIT 500");
        }

        List<SpeedOverTimeData> reversed = jdbcTemplate.query(sql.toString(), args.toArray(), (rs, rowNum) -> new SpeedOverTimeData(
                rs.getString("minute_label"),
                rs.getDouble("avg_speed")
        ));
        java.util.Collections.reverse(reversed);
        return reversed;
    }

    public List<SpeedOverTimeData> getSpeedOverTime() {
        return getSpeedOverTime(null, null, null, null);
    }

    /**
     * Pontos de congestionamento com filtragem e taxas de ocupação por evento.
     */
    public List<CongestionData> getCongestion(String startDate, String endDate, String startHour, String endHour) {
        StringBuilder sql = new StringBuilder("""
                SELECT
                    t.bus_id,
                    ST_Y(t.location::geometry) AS lat,
                    ST_X(t.location::geometry) AS lng,
                    t.speed_kmh,
                    t.passenger_count,
                    COALESCE(b.capacity, 50) AS capacity,
                    CASE 
                        WHEN COALESCE(b.capacity, 50) > 0 THEN ROUND(100.0 * t.passenger_count / COALESCE(b.capacity, 50), 1)::double precision
                        ELSE 0.0
                    END AS occupancy_rate,
                    TO_CHAR(t.recorded_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS recorded_at_label,
                    r.code  AS route_code,
                    r.name  AS route_name
                FROM vehicle_telemetry t
                JOIN buses  b ON t.bus_id   = b.bus_code
                JOIN routes r ON b.route_id = r.id
                WHERE t.speed_kmh < 15
                  AND t.passenger_count > 10
                  AND t.status = 'active'
                """);
        List<Object> args = new java.util.ArrayList<>();
        appendFilters(sql, args, startDate, endDate, startHour, endHour, "t.recorded_at >= NOW() - INTERVAL '2 hours'");

        sql.append("""
                ORDER BY t.recorded_at DESC
                LIMIT 500
                """);

        return jdbcTemplate.query(sql.toString(), args.toArray(), (rs, rowNum) -> new CongestionData(
                rs.getString("bus_id"),
                rs.getDouble("lat"),
                rs.getDouble("lng"),
                rs.getDouble("speed_kmh"),
                rs.getInt("passenger_count"),
                rs.getString("recorded_at_label"),
                rs.getString("route_code"),
                rs.getString("route_name"),
                rs.getLong("capacity"),
                rs.getDouble("occupancy_rate")
        ));
    }

    public List<CongestionData> getCongestion() {
        return getCongestion(null, null, null, null);
    }
}
