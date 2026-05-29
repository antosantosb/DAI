package dai.tub.pgu.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import dai.tub.pgu.domain.JourneyPattern;
import dai.tub.pgu.domain.PatternSegment;
import dai.tub.pgu.domain.PatternStop;
import dai.tub.pgu.repository.JourneyPatternRepository;
import dai.tub.pgu.repository.PatternSegmentRepository;
import dai.tub.pgu.repository.PatternStopRepository;
import dai.tub.pgu.repository.TripRepository;

/**
 * Sprint 1 (Fase 1/2): expõe os JourneyPattern (padrões) de uma rota, para a
 * página de detalhe (backoffice) e para destacar um padrão no Livemap.
 */
@Service
public class PatternService
{
    private final JourneyPatternRepository patternRepo;
    private final PatternStopRepository patternStopRepo;
    private final PatternSegmentRepository patternSegmentRepo;
    private final TripRepository tripRepo;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PatternService(JourneyPatternRepository patternRepo,
                          PatternStopRepository patternStopRepo,
                          PatternSegmentRepository patternSegmentRepo,
                          TripRepository tripRepo,
                          JdbcTemplate jdbcTemplate)
    {
        this.patternRepo = patternRepo;
        this.patternStopRepo = patternStopRepo;
        this.patternSegmentRepo = patternSegmentRepo;
        this.tripRepo = tripRepo;
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Padrões de uma rota: id, direção, nome, nº de paragens, nº de trips. */
    public List<Map<String, Object>> getByRoute(Long routeId)
    {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JourneyPattern p : patternRepo.findByRouteIdOrderByDirectionIdAscIdAsc(routeId))
        {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("directionId", p.getDirectionId());
            m.put("name", p.getName());
            m.put("stopCount", patternStopRepo.countByPatternId(p.getId()));
            m.put("tripCount", tripRepo.countByPatternId(p.getId()));
            out.add(m);
        }
        return out;
    }

    /** Geometria (polyline [lat,lon]) de um padrão, para destacar no mapa. */
    public Map<String, Object> getGeometry(Long patternId)
    {
        List<List<Double>> pts = new ArrayList<>();
        for (PatternSegment seg : patternSegmentRepo.findByPatternIdOrderByFromSequence(patternId))
        {
            try
            {
                pts.addAll(objectMapper.readValue(seg.getPoints(),
                        new TypeReference<List<List<Double>>>() {}));
            }
            catch (Exception ignored) { /* segmento sem geometria válida */ }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", patternId);
        m.put("points", pts);
        return m;
    }

    /** Paragens ordenadas de um padrão. */
    public List<Map<String, Object>> getStops(Long patternId)
    {
        List<Map<String, Object>> out = new ArrayList<>();
        for (PatternStop ps : patternStopRepo.findByPatternIdOrderByStopSequence(patternId))
        {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("stopId", ps.getStop().getId());
            m.put("stopName", ps.getStop().getName());
            m.put("stopCode", ps.getStop().getCode());
            m.put("sequence", ps.getStopSequence());
            out.add(m);
        }
        return out;
    }

    /** Trips (viagens) de um padrão, agregadas: 1ª partida, última chegada, nº paragens. */
    public List<Map<String, Object>> getTrips(Long patternId)
    {
        return jdbcTemplate.query(
            "SELECT t.gtfs_trip_id AS trip_id, MIN(tst.departure_time) AS first_departure, "
            + "MAX(tst.arrival_time) AS last_arrival, COUNT(*) AS stop_count "
            + "FROM trip t JOIN trip_stop_time tst ON tst.trip_id = t.id "
            + "WHERE t.pattern_id = ? GROUP BY t.gtfs_trip_id ORDER BY first_departure",
            (rs, i) -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("tripId", rs.getString("trip_id"));
                m.put("firstDeparture", rs.getString("first_departure"));
                m.put("lastArrival", rs.getString("last_arrival"));
                m.put("stopCount", rs.getInt("stop_count"));
                return m;
            },
            patternId);
    }
}
