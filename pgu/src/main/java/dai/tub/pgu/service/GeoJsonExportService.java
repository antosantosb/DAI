package dai.tub.pgu.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import dai.tub.pgu.domain.BusStop;
import dai.tub.pgu.domain.JourneyPattern;
import dai.tub.pgu.domain.PatternSegment;
import dai.tub.pgu.domain.PatternStop;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.repository.BusStopRepository;
import dai.tub.pgu.repository.JourneyPatternRepository;
import dai.tub.pgu.repository.PatternSegmentRepository;
import dai.tub.pgu.repository.PatternStopRepository;
import dai.tub.pgu.repository.RouteRepository;

/**
 * Sprint 1 (F1): export GeoJSON de rotas e paragens (R.BO.01).
 *
 * <p>Constrói {@code FeatureCollection} GeoJSON 2008 compliant:
 * <ul>
 *   <li>Rotas: {@code LineString} por linha, geometria agregada dos
 *       {@code PatternSegment} do padrao representativo (Transmodel).
 *   <li>Paragens: {@code Point} (lon, lat) com propriedades {@code code},
 *       {@code name} e {@code routeIds} (rotas que servem a paragem).
 * </ul>
 *
 * <p>Output: {@code application/geo+json}. Endpoints abertos (sem autenticação)
 * para integração com QGIS e dados.gov.pt (Catálogo Nacional).
 */
@Service
public class GeoJsonExportService
{
    private final RouteRepository routeRepository;
    private final JourneyPatternRepository journeyPatternRepository;
    private final PatternStopRepository patternStopRepository;
    private final PatternSegmentRepository patternSegmentRepository;
    private final BusStopRepository busStopRepository;
    private final ObjectMapper objectMapper;

    public GeoJsonExportService(RouteRepository routeRepository,
                                JourneyPatternRepository journeyPatternRepository,
                                PatternStopRepository patternStopRepository,
                                PatternSegmentRepository patternSegmentRepository,
                                BusStopRepository busStopRepository)
    {
        this.routeRepository = routeRepository;
        this.journeyPatternRepository = journeyPatternRepository;
        this.patternStopRepository = patternStopRepository;
        this.patternSegmentRepository = patternSegmentRepository;
        this.busStopRepository = busStopRepository;
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Devolve um {@code FeatureCollection} com uma {@code LineString} por rota.
     * Coordenadas em GeoJSON: {@code [longitude, latitude]} (RFC 7946).
     */
    public Map<String, Object> exportRoutes()
    {
        List<Map<String, Object>> features = new ArrayList<>();
        for (Route route : routeRepository.findAll()) {
            List<List<Double>> coords = collectLineString(route);

            // RFC 7946: Feature pode ter "geometry": null. Mantemos a rota
            // no export mesmo sem segmentos para que a contagem do portal
            // open-data corresponda ao total de rotas registadas.
            Object geometryValue;
            if (coords.isEmpty()) {
                geometryValue = null;
            } else {
                Map<String, Object> geometry = new LinkedHashMap<>();
                geometry.put("type", "LineString");
                geometry.put("coordinates", coords);
                geometryValue = geometry;
            }

            Map<String, Object> props = new LinkedHashMap<>();
            props.put("id", route.getId());
            props.put("code", route.getCode());
            props.put("name", route.getName());
            props.put("color", route.getColor());
            if (route.getOperator() != null) {
                props.put("operatorCode", route.getOperator().getCode());
                props.put("operatorName", route.getOperator().getName());
            }

            Map<String, Object> feature = new LinkedHashMap<>();
            feature.put("type", "Feature");
            feature.put("geometry", geometryValue);
            feature.put("properties", props);
            features.add(feature);
        }
        return featureCollection(features);
    }

    /**
     * Devolve um {@code FeatureCollection} com um {@code Point} por paragem.
     */
    public Map<String, Object> exportStops()
    {
        // Cache: route id -> code (evita N+1 ao popular routeCodes por paragem)
        Map<Long, String> routeIdToCode = new HashMap<>();
        for (Route r : routeRepository.findAll()) {
            routeIdToCode.put(r.getId(), r.getCode());
        }

        // Pre-popular paragem -> rotas que a servem, via padrao representativo
        // de cada rota (Transmodel). Com N rotas < 100 e M paragens < 500 o
        // custo e' aceitavel e o codigo continua claro de ler.
        Map<Long, List<String>> stopRoutes = new HashMap<>();
        for (Route r : routeRepository.findAll()) {
            for (PatternStop ps : representativeStops(r.getId())) {
                stopRoutes.computeIfAbsent(ps.getStop().getId(), k -> new ArrayList<>())
                          .add(r.getCode());
            }
        }

        List<Map<String, Object>> features = new ArrayList<>();
        for (BusStop stop : busStopRepository.findAll()) {
            if (stop.getLocation() == null) continue;

            Map<String, Object> geometry = new LinkedHashMap<>();
            geometry.put("type", "Point");
            // GeoJSON: [lon, lat]. JTS Point: getX()=lon, getY()=lat (4326).
            geometry.put("coordinates", List.of(stop.getLocation().getX(), stop.getLocation().getY()));

            Map<String, Object> props = new LinkedHashMap<>();
            props.put("id", stop.getId());
            props.put("code", stop.getCode());
            props.put("name", stop.getName());
            props.put("routeCodes", stopRoutes.getOrDefault(stop.getId(), List.of()));

            Map<String, Object> feature = new LinkedHashMap<>();
            feature.put("type", "Feature");
            feature.put("geometry", geometry);
            feature.put("properties", props);
            features.add(feature);
        }
        return featureCollection(features);
    }

    /**
     * Constrói a {@code LineString} de uma rota a partir do seu padrao
     * representativo (o JourneyPattern com mais paragens). Tenta primeiro
     * concatenar os {@code PatternSegment} (geometria detalhada); se o padrao
     * nao tiver segmentos, usa as coordenadas das proprias paragens do padrao.
     * Devolve coordenadas GeoJSON {@code [lon, lat]} (RFC 7946).
     */
    private List<List<Double>> collectLineString(Route route)
    {
        JourneyPattern representative = representativePattern(route.getId());
        if (representative == null) return new ArrayList<>();

        // 1) Geometria detalhada: concatenar os pontos dos segmentos por ordem.
        // PatternSegment.points guarda [[lat, lon], ...] (mesmo formato legado
        // do antigo RouteSegment), pelo que invertemos para [lon, lat] (GeoJSON).
        List<List<Double>> all = new ArrayList<>();
        List<PatternSegment> segments =
                patternSegmentRepository.findByPatternIdOrderByFromSequence(representative.getId());
        for (PatternSegment seg : segments) {
            try {
                List<List<Double>> latLonPoints = objectMapper.readValue(
                        seg.getPoints(),
                        new com.fasterxml.jackson.core.type.TypeReference<List<List<Double>>>() {});
                for (List<Double> p : latLonPoints) {
                    if (p == null || p.size() < 2) continue;
                    // [lat, lon] -> [lon, lat] (GeoJSON spec)
                    all.add(List.of(p.get(1), p.get(0)));
                }
            } catch (JsonProcessingException ignored) {
                // segmento mal-formado: salta sem rebentar o export
            }
        }
        if (!all.isEmpty()) return all;

        // 2) Fallback sem segmentos: usar as paragens do padrao representativo.
        // JTS Point: getX()=lon, getY()=lat -> [lon, lat] (GeoJSON spec).
        for (PatternStop ps : patternStopRepository.findByPatternIdOrderByStopSequence(representative.getId())) {
            if (ps.getStop().getLocation() == null) continue;
            all.add(List.of(ps.getStop().getLocation().getX(), ps.getStop().getLocation().getY()));
        }
        return all;
    }

    /**
     * Padrao representativo de uma rota = o JourneyPattern com MAIS PatternStops
     * (o mais completo). {@code null} se a rota nao tiver padroes.
     */
    private JourneyPattern representativePattern(Long routeId)
    {
        JourneyPattern best = null;
        int bestSize = -1;
        for (JourneyPattern p : journeyPatternRepository.findByRouteIdOrderByDirectionIdAscIdAsc(routeId)) {
            int size = patternStopRepository.findByPatternIdOrderByStopSequence(p.getId()).size();
            if (size > bestSize) {
                bestSize = size;
                best = p;
            }
        }
        return best;
    }

    /** Paragens do padrao representativo de uma rota (lista vazia se nao houver). */
    private List<PatternStop> representativeStops(Long routeId)
    {
        JourneyPattern representative = representativePattern(routeId);
        if (representative == null) return List.of();
        return patternStopRepository.findByPatternIdOrderByStopSequence(representative.getId());
    }

    private Map<String, Object> featureCollection(List<Map<String, Object>> features)
    {
        Map<String, Object> fc = new LinkedHashMap<>();
        fc.put("type", "FeatureCollection");
        fc.put("features", features);
        return fc;
    }
}
