package dai.tub.pgu.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.ValidationEvent;

/**
 * Sprint 5 (3.3): queries de leitura sobre validation_event para dashboards
 * e field-check. As queries devolvem agregados (Map) para evitar projeccoes
 * adicionais; o controller serializa em JSON directamente.
 */
@Repository
public interface ValidationEventRepository extends JpaRepository<ValidationEvent, Long>
{
    List<ValidationEvent> findByBusIdAndValidatedAtBetweenOrderByValidatedAtAsc(
        String busId, OffsetDateTime from, OffsetDateTime to);

    @Query(value =
        "SELECT EXTRACT(HOUR FROM validated_at)::int AS hour, COUNT(*) AS total " +
        "FROM validation_event " +
        "WHERE validated_at >= NOW() - INTERVAL '24 hours' " +
        "GROUP BY 1 ORDER BY 1", nativeQuery = true)
    List<Map<String, Object>> demandByHour24h();

    @Query(value =
        "SELECT COALESCE(r.code, 'unknown') AS line, COUNT(*) AS total " +
        "FROM validation_event ve LEFT JOIN routes r ON ve.route_id = r.id " +
        "WHERE ve.validated_at >= NOW() - INTERVAL '24 hours' " +
        "GROUP BY 1 ORDER BY 2 DESC LIMIT 10", nativeQuery = true)
    List<Map<String, Object>> demandByLine24h();

    @Query(value =
        "SELECT t.tipo AS channel, COUNT(*) AS total " +
        "FROM validation_event ve JOIN ticket t ON ve.ticket_id = t.id " +
        "WHERE ve.validated_at >= NOW() - INTERVAL '24 hours' " +
        "GROUP BY 1 ORDER BY 2 DESC", nativeQuery = true)
    List<Map<String, Object>> demandByChannel24h();

    @Query(value =
        "SELECT t.fare_category AS category, COUNT(*) AS total " +
        "FROM validation_event ve JOIN ticket t ON ve.ticket_id = t.id " +
        "WHERE ve.validated_at >= NOW() - INTERVAL '24 hours' " +
        "GROUP BY 1 ORDER BY 2 DESC", nativeQuery = true)
    List<Map<String, Object>> demandByCategory24h();

    @Query(value =
        "SELECT COALESCE(sz.coroa, 0)::int AS zone, COUNT(*) AS total " +
        "FROM validation_event ve LEFT JOIN stop_zone sz ON ve.stop_id = sz.stop_id " +
        "WHERE ve.validated_at >= NOW() - INTERVAL '24 hours' " +
        "GROUP BY 1 ORDER BY 1", nativeQuery = true)
    List<Map<String, Object>> demandByZone24h();

    @Query(value =
        "SELECT COUNT(*) FROM validation_event " +
        "WHERE validated_at >= NOW() - INTERVAL '24 hours'", nativeQuery = true)
    long totalLast24h();
}
