package dai.tub.pgu.service;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Sprint 1 (F4): horários planeados (trips do GTFS).
 *
 * <p>Uma "trip" e' agora uma linha da tabela {@code trip} — rota + direção
 * (via {@code journey_pattern}) + service_id + sequência de paragens com horas
 * (via {@code trip_stop_time}). Esta camada expõe-as para a aba Horários
 * (vista) e para o selector de trip ao pôr um autocarro numa rota.
 *
 * <p>O {@code trip_id} devolvido ao cliente e' o {@code trip.gtfs_trip_id}
 * (string), para os deep-links de detalhe de trip continuarem a funcionar.
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
        // trip_count por rota = nº de linhas em trip para essa rota.
        return jdbc.queryForList(
            "SELECT r.id AS route_id, r.code AS route_code, r.name AS route_name, "
            + "r.color AS route_color, "
            + "COUNT(t.id) AS trip_count "
            + "FROM routes r "
            + "LEFT JOIN trip t ON t.route_id = r.id "
            + "GROUP BY r.id, r.code, r.name, r.color "
            + "ORDER BY r.code");
    }

    /**
     * Trips de uma rota: trip_id, direção, service_id, primeira partida,
     * última chegada, nº de paragens.
     */
    public List<Map<String, Object>> getTrips(Long routeId)
    {
        // Agrega trip_stop_time por trip; junta trip (gtfs_trip_id, service_id,
        // filtro de rota) e journey_pattern (direction_id). O trip_id devolvido
        // e' o gtfs_trip_id, para os links de detalhe continuarem validos.
        return jdbc.queryForList(
            "SELECT t.gtfs_trip_id AS trip_id, jp.direction_id, t.service_id, "
            + "MIN(tst.departure_time) AS first_departure, "
            + "MAX(tst.arrival_time)   AS last_arrival, "
            + "COUNT(*)                AS stop_count "
            + "FROM trip t "
            + "JOIN trip_stop_time tst ON tst.trip_id = t.id "
            + "JOIN journey_pattern jp ON jp.id = t.pattern_id "
            + "WHERE t.route_id = ? "
            + "GROUP BY t.gtfs_trip_id, jp.direction_id, t.service_id "
            + "ORDER BY MIN(tst.departure_time), t.gtfs_trip_id",
            routeId);
    }

    /**
     * Paragens de uma trip, ordenadas por sequência, com horas planeadas.
     */
    public List<Map<String, Object>> getTripStops(String tripId)
    {
        // tripId e' o gtfs_trip_id (string). Junta-se trip_stop_time -> trip
        // (via gtfs_trip_id) -> bus_stops.
        return jdbc.queryForList(
            "SELECT tst.stop_sequence, tst.arrival_time, tst.departure_time, "
            + "bs.id AS stop_id, bs.name AS stop_name, bs.code AS stop_code "
            + "FROM trip_stop_time tst "
            + "JOIN trip t ON tst.trip_id = t.id "
            + "JOIN bus_stops bs ON tst.stop_id = bs.id "
            + "WHERE t.gtfs_trip_id = ? "
            + "ORDER BY tst.stop_sequence",
            tripId);
    }
}
