package dai.tub.pgu.service;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Sprint 1 (F4): horários planeados (trips do GTFS).
 *
 * <p>Uma "trip" e' um grupo de linhas {@code stop_schedule} com o mesmo
 * {@code trip_id} — rota + direção + service_id + sequência de paragens com
 * horas. Esta camada expõe-as para a aba Horários (vista) e para o selector
 * de trip ao pôr um autocarro numa rota.
 */
@Service
public class ScheduleService
{
    private final JdbcTemplate jdbc;

    public ScheduleService(JdbcTemplate jdbc)
    {
        this.jdbc = jdbc;
    }

    /**
     * Cobertura por rota: nº de trips planeadas. Inclui rotas sem horário
     * (tripCount = 0) para se ver o gap.
     */
    public List<Map<String, Object>> getCoverage()
    {
        return jdbc.queryForList(
            "SELECT r.id AS route_id, r.code AS route_code, r.name AS route_name, "
            + "r.color AS route_color, "
            + "COUNT(DISTINCT ss.trip_id) AS trip_count "
            + "FROM routes r "
            + "LEFT JOIN stop_schedule ss ON ss.route_id = r.id "
            + "GROUP BY r.id, r.code, r.name, r.color "
            + "ORDER BY r.code");
    }

    /**
     * Trips de uma rota: trip_id, direção, service_id, primeira partida,
     * última chegada, nº de paragens.
     */
    public List<Map<String, Object>> getTrips(Long routeId)
    {
        return jdbc.queryForList(
            "SELECT trip_id, direction_id, service_id, "
            + "MIN(departure_time) AS first_departure, "
            + "MAX(arrival_time)   AS last_arrival, "
            + "COUNT(*)            AS stop_count "
            + "FROM stop_schedule WHERE route_id = ? "
            + "GROUP BY trip_id, direction_id, service_id "
            + "ORDER BY MIN(departure_time), trip_id",
            routeId);
    }

    /**
     * Paragens de uma trip, ordenadas por sequência, com horas planeadas.
     */
    public List<Map<String, Object>> getTripStops(String tripId)
    {
        return jdbc.queryForList(
            "SELECT ss.stop_sequence, ss.arrival_time, ss.departure_time, "
            + "bs.id AS stop_id, bs.name AS stop_name, bs.code AS stop_code "
            + "FROM stop_schedule ss "
            + "JOIN bus_stops bs ON ss.stop_id = bs.id "
            + "WHERE ss.trip_id = ? "
            + "ORDER BY ss.stop_sequence",
            tripId);
    }
}
