package dai.tub.pgu.service;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import dai.tub.pgu.dto.AnalyticsDTOs.BusEfficiencyData;
import dai.tub.pgu.dto.AnalyticsDTOs.CongestionData;
import dai.tub.pgu.dto.AnalyticsDTOs.CoverageIndicators;
import dai.tub.pgu.dto.AnalyticsDTOs.FleetOccupancyData;
import dai.tub.pgu.dto.AnalyticsDTOs.HeatmapData;
import dai.tub.pgu.dto.AnalyticsDTOs.RouteAdherenceData;
import dai.tub.pgu.dto.AnalyticsDTOs.RouteDelayCorrelation;
import dai.tub.pgu.dto.AnalyticsDTOs.RouteDelayData;
import dai.tub.pgu.dto.AnalyticsDTOs.RouteHourFrequency;
import dai.tub.pgu.dto.AnalyticsDTOs.SpeedOverTimeData;
import dai.tub.pgu.dto.AnalyticsDTOs.StopWaitTime;

@Service
public class AnalyticsService {

    private final JdbcTemplate jdbcTemplate;

    public AnalyticsService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private void appendFilters(StringBuilder sql, List<Object> args, String startDate, String endDate, String startHour, String endHour, String defaultFilter) {
        boolean hasFilter = false;
        if (startDate != null && !startDate.trim().isEmpty()) {
            sql.append(" AND (t.recorded_at AT TIME ZONE 'Europe/Lisbon')::date >= ?::date\n");
            args.add(startDate.trim());
            hasFilter = true;
        }
        if (endDate != null && !endDate.trim().isEmpty()) {
            sql.append(" AND (t.recorded_at AT TIME ZONE 'Europe/Lisbon')::date <= ?::date\n");
            args.add(endDate.trim());
            hasFilter = true;
        }
        if (startHour != null && !startHour.trim().isEmpty()) {
            sql.append(" AND (t.recorded_at AT TIME ZONE 'Europe/Lisbon')::time >= ?::time\n");
            args.add(startHour.trim());
            hasFilter = true;
        }
        if (endHour != null && !endHour.trim().isEmpty()) {
            sql.append(" AND (t.recorded_at AT TIME ZONE 'Europe/Lisbon')::time <= ?::time\n");
            args.add(endHour.trim());
            hasFilter = true;
        }
        if (!hasFilter && defaultFilter != null) {
            sql.append(" AND ").append(defaultFilter).append("\n");
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

        List<FleetOccupancyData> reversed = jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new FleetOccupancyData(
                rs.getString("minute_label"),
                rs.getLong("total_passengers"),
                rs.getLong("active_buses"),
                rs.getDouble("occupancy_rate")
        ), args.toArray());
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

        return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new RouteDelayData(
                rs.getString("route_code"),
                rs.getLong("active_count"),
                rs.getLong("at_stop_count"),
                rs.getLong("stopping_count"),
                rs.getLong("delayed_count"),
                rs.getLong("stopped_count")
        ), args.toArray());
    }

    /**
     * Sprint 1 (F2): adherence stoplight por rota (R.IVT.06).
     *
     * <p>Classifica cada rota como verde/amarelo/vermelho com base na proporção
     * de observações de telemetria com status {@code delayed} sobre o total
     * observado. Útil para o overlay do Livemap e para a sidebar Rotas.
     *
     * <p>O avgDelayMin é um proxy derivado (delayedShare * 15) — a TUB nao
     * publica horários planeados num formato comparável com os actuais, pelo
     * que esta é a aproximação mais honesta que os dados existentes permitem.
     */
    public List<RouteAdherenceData> getRouteAdherence(String startDate, String endDate,
                                                     String startHour, String endHour) {
        StringBuilder sql = new StringBuilder("""
                SELECT
                    r.id   AS route_id,
                    r.code AS route_code,
                    r.name AS route_name,
                    r.color AS route_color,
                    o.code AS operator_code,
                    COUNT(*) AS total_obs,
                    COUNT(*) FILTER (WHERE t.status = 'delayed') AS delayed_obs
                FROM routes r
                LEFT JOIN operators o ON r.operator_id = o.id
                LEFT JOIN buses b ON b.route_id = r.id
                LEFT JOIN vehicle_telemetry t ON t.bus_id = b.bus_code
                WHERE 1=1
                """);
        List<Object> args = new java.util.ArrayList<>();
        appendFilters(sql, args, startDate, endDate, startHour, endHour, "t.recorded_at >= CURRENT_DATE");

        sql.append("""
                GROUP BY r.id, r.code, r.name, r.color, o.code
                ORDER BY r.code
                """);

        return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> {
            long obs = rs.getLong("total_obs");
            long delayed = rs.getLong("delayed_obs");
            double share = obs > 0 ? (double) delayed / obs : 0.0;
            double avgDelayMin = share * 15.0;
            String color;
            if (share < 0.10)      color = "green";
            else if (share < 0.30) color = "yellow";
            else                   color = "red";
            return new RouteAdherenceData(
                    rs.getLong("route_id"),
                    rs.getString("route_code"),
                    rs.getString("route_name"),
                    color,
                    rs.getString("operator_code"),
                    Math.round(share * 1000.0) / 1000.0,
                    Math.round(avgDelayMin * 10.0) / 10.0,
                    obs,
                    delayed
            );
        }, args.toArray());
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

        return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new HeatmapData(
                rs.getDouble("lat"),
                rs.getDouble("lng"),
                rs.getInt("passenger_count")
        ), args.toArray());
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

        return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new BusEfficiencyData(
                rs.getString("bus_id"),
                rs.getDouble("avg_passengers"),
                rs.getInt("max_passengers"),
                rs.getLong("capacity"),
                rs.getDouble("avg_occupancy_rate"),
                rs.getDouble("max_occupancy_rate")
        ), args.toArray());
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

        List<SpeedOverTimeData> reversed = jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new SpeedOverTimeData(
                rs.getString("minute_label"),
                rs.getDouble("avg_speed")
        ), args.toArray());
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

        return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new CongestionData(
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
        ), args.toArray());
    }

    public List<CongestionData> getCongestion() {
        return getCongestion(null, null, null, null);
    }

    /**
     * Sprint 1 (F6): cruzamento de dados de mobilidade real (R.IVT.10).
     * Devolve os eventos operacionais (ocorrencias e alertas) dos autocarros
     * que servem a rota indicada, dentro da janela analisada, para o operador
     * correlacionar com os atrasos da linha.
     *
     * As duas fontes sao unidas num subquery cujo timestamp e' exposto como
     * "t.recorded_at", de modo a reutilizar o mesmo appendFilters (data/hora,
     * fuso Europe/Lisbon) usado pelos restantes endpoints de analytics.
     *
     * Ligacao a rota: nenhuma das tabelas tem FK directa para a linha. Os
     * eventos ligam-se ao autocarro pelo codigo (ocorrencias.ativo_id e
     * historico_alertas.autocarro == buses.bus_code) e o autocarro a' rota
     * por buses.route_id.
     */
    public List<RouteDelayCorrelation> getRouteDelayCorrelations(Long routeId, String startDate,
                                                                 String endDate, String startHour, String endHour) {
        StringBuilder sql = new StringBuilder("""
                SELECT
                    TO_CHAR(t.recorded_at AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS recorded_at_label,
                    t.source,
                    t.level,
                    t.title,
                    t.description,
                    t.bus_id
                FROM (
                    SELECT
                        o.timestamp_abertura          AS recorded_at,
                        'OCORRENCIA'                  AS source,
                        o.prioridade                  AS level,
                        o.tipo_anomalia               AS title,
                        o.descricao                   AS description,
                        o.ativo_id                    AS bus_id
                    FROM ocorrencias o
                    JOIN buses b ON o.ativo_id = b.bus_code
                    WHERE o.tipo_ativo = 'BUS' AND b.route_id = ?
                    UNION ALL
                    SELECT
                        h.data                        AS recorded_at,
                        'ALERTA'                      AS source,
                        'ALERTA'                      AS level,
                        h.motivo                      AS title,
                        NULL                          AS description,
                        h.autocarro                   AS bus_id
                    FROM historico_alertas h
                    JOIN buses b ON h.autocarro = b.bus_code
                    WHERE b.route_id = ?
                ) t
                WHERE 1=1
                """);
        List<Object> args = new java.util.ArrayList<>();
        // Os dois placeholders do route_id (ocorrencias e alertas) vem antes dos filtros.
        args.add(routeId);
        args.add(routeId);
        // Sem filtros de data: limita-se aos ultimos 7 dias para a janela ser util.
        appendFilters(sql, args, startDate, endDate, startHour, endHour, "t.recorded_at >= NOW() - INTERVAL '7 days'");

        sql.append("""
                ORDER BY t.recorded_at DESC
                LIMIT 100
                """);

        return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new RouteDelayCorrelation(
                rs.getString("recorded_at_label"),
                rs.getString("source"),
                rs.getString("level"),
                rs.getString("title"),
                rs.getString("description"),
                rs.getString("bus_id")
        ), args.toArray());
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Sprint 1 (F5): indicadores de cobertura e frequencia (R.IVT.06)
    //
    //  Calculados sobre o horario planeado (modelo Transmodel) e a geometria
    //  das paragens, NAO sobre a telemetria. Por isso nao recebem filtros de
    //  data/hora. As horas GTFS (trip_stop_time.departure_time) sao texto
    //  "HH:MM:SS" e podem passar das 24h; sao convertidas para minutos com
    //  split_part e a hora-do-dia e' tirada modulo 24.
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Reune os tres indicadores de cobertura/frequencia num so objeto.
     */
    public CoverageIndicators getCoverageIndicators() {
        return new CoverageIndicators(
                computeGeographicCoveragePct(),
                computeFrequencyByRouteHour(),
                computeWaitTimeByStop());
    }

    /**
     * Percentagem da area de servico a menos de ~400m a pe de qualquer paragem.
     * Sem poligono administrativo de Braga, a area total e' aproximada pelo
     * convex hull de todas as paragens. Distancias metricas via geography.
     * Devolve 0 se nao houver paragens (ou area total nula).
     */
    private double computeGeographicCoveragePct() {
        String sql = """
                WITH covered AS (
                    SELECT ST_Area(
                               ST_Union(ST_Buffer(location::geography, 400)::geometry)::geography
                           ) AS covered_area
                    FROM bus_stops
                ),
                hull AS (
                    SELECT ST_Area(
                               ST_ConvexHull(ST_Collect(location))::geography
                           ) AS total_area
                    FROM bus_stops
                )
                SELECT LEAST(100.0,
                             COALESCE(covered.covered_area, 0)
                               / NULLIF(hull.total_area, 0) * 100.0
                       )::double precision AS pct
                FROM covered, hull
                """;
        Double pct = jdbcTemplate.query(sql, rs -> rs.next() ? (Double) rs.getObject("pct") : null);
        return pct != null ? Math.round(pct * 10.0) / 10.0 : 0.0;
    }

    /**
     * Intervalo medio (headway) entre partidas por linha e hora do dia.
     *
     * <p>Partida de uma trip = departure_time da sua primeira paragem (menor
     * stop_sequence). Para cada (linha, hora) com >= 2 partidas, o headway medio
     * e' (ultima - primeira) / (n - 1) em minutos, que e' exatamente a media dos
     * intervalos entre partidas consecutivas. Com 1 partida o headway fica nulo.</p>
     */
    private List<RouteHourFrequency> computeFrequencyByRouteHour() {
        String sql = """
                WITH first_dep AS (
                    SELECT DISTINCT ON (tst.trip_id)
                           t.route_id                                         AS route_id,
                           (split_part(tst.departure_time, ':', 1)::int) * 60
                             + split_part(tst.departure_time, ':', 2)::int    AS dep_minute
                    FROM trip_stop_time tst
                    JOIN trip t ON t.id = tst.trip_id
                    ORDER BY tst.trip_id, tst.stop_sequence
                )
                SELECT r.id                                                   AS route_id,
                       r.code                                                 AS route_code,
                       r.name                                                 AS route_name,
                       (fd.dep_minute / 60) % 24                              AS hour,
                       COUNT(*)                                               AS trip_count,
                       CASE WHEN COUNT(*) >= 2
                            THEN (MAX(fd.dep_minute) - MIN(fd.dep_minute))::double precision
                                 / (COUNT(*) - 1)
                            ELSE NULL
                       END                                                    AS avg_headway
                FROM first_dep fd
                JOIN routes r ON r.id = fd.route_id
                GROUP BY r.id, r.code, r.name, (fd.dep_minute / 60) % 24
                ORDER BY r.code, hour
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Object headway = rs.getObject("avg_headway");
            Double avgHeadway = headway != null
                    ? Math.round(((Number) headway).doubleValue() * 10.0) / 10.0
                    : null;
            return new RouteHourFrequency(
                    rs.getLong("route_id"),
                    rs.getString("route_code"),
                    rs.getString("route_name"),
                    rs.getInt("hour"),
                    avgHeadway,
                    rs.getInt("trip_count"));
        });
    }

    /**
     * Tempo medio de espera por paragem = headway medio na paragem / 2.
     *
     * <p>Headway na paragem = (ultima - primeira passagem) / (passagens - 1) em
     * minutos, usando departure_time de todas as trips que servem a paragem.
     * So paragens com >= 2 passagens entram (headway definido). Ordenado pela
     * espera decrescente; limitado a 50 paragens.</p>
     */
    private List<StopWaitTime> computeWaitTimeByStop() {
        String sql = """
                WITH passings AS (
                    SELECT tst.stop_id                                        AS stop_id,
                           (split_part(tst.departure_time, ':', 1)::int) * 60
                             + split_part(tst.departure_time, ':', 2)::int    AS pass_minute
                    FROM trip_stop_time tst
                )
                SELECT bs.id                                                  AS stop_id,
                       bs.code                                                AS stop_code,
                       bs.name                                                AS stop_name,
                       COUNT(*)                                               AS departures_per_day,
                       (MAX(p.pass_minute) - MIN(p.pass_minute))::double precision
                         / (COUNT(*) - 1) / 2.0                               AS avg_wait
                FROM passings p
                JOIN bus_stops bs ON bs.id = p.stop_id
                GROUP BY bs.id, bs.code, bs.name
                HAVING COUNT(*) >= 2
                ORDER BY avg_wait DESC
                LIMIT 50
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new StopWaitTime(
                rs.getLong("stop_id"),
                rs.getString("stop_code"),
                rs.getString("stop_name"),
                Math.round(rs.getDouble("avg_wait") * 10.0) / 10.0,
                rs.getInt("departures_per_day")));
    }
}
