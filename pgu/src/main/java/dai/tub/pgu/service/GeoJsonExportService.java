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
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.domain.RouteSegment;
import dai.tub.pgu.domain.RouteStop;
import dai.tub.pgu.repository.BusStopRepository;
import dai.tub.pgu.repository.RouteRepository;
import dai.tub.pgu.repository.RouteSegmentRepository;

/**
 * Sprint 1 (F1): export GeoJSON de rotas e paragens (R.BO.01).
 *
 * <p>Constrói {@code FeatureCollection} GeoJSON 2008 compliant:
 * <ul>
 *   <li>Rotas: {@code LineString} por linha, geometria agregada dos
 *       {@code route_segments} ordenados por {@code from_stop_order}.
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
    private final RouteSegmentRepository segmentRepository;
    private final BusStopRepository busStopRepository;
    private final ObjectMapper objectMapper;

    public GeoJsonExportService(RouteRepository routeRepository,
                                RouteSegmentRepository segmentRepository,
                                BusStopRepository busStopRepository)
    {
        this.routeRepository = routeRepository;
        this.segmentRepository = segmentRepository;
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

        // Pre-popular paragem -> rotas que a servem.
        // Uma query mais eficiente seria via JPQL, mas com N routes < 100 e
        // M paragens < 500, este loop é O(N*M_avg) e é claro de ler.
        Map<Long, List<String>> stopRoutes = new HashMap<>();
        for (Route r : routeRepository.findAll()) {
            for (RouteStop rs : r.getRouteStops()) {
                stopRoutes.computeIfAbsent(rs.getStop().getId(), k -> new ArrayList<>())
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
     * Agrega todos os segmentos de uma rota numa única lista de coordenadas
     * GeoJSON ({@code [lon, lat]}). Os segmentos guardam pontos em formato
     * {@code [[lat, lon], ...]} (legado), pelo que invertemos aqui.
     */
    private List<List<Double>> collectLineString(Route route)
    {
        List<List<Double>> all = new ArrayList<>();
        List<RouteSegment> segments = segmentRepository
                .findByRouteIdOrderByFromStopOrder(route.getId());

        for (RouteSegment seg : segments) {
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
        return all;
    }

    private Map<String, Object> featureCollection(List<Map<String, Object>> features)
    {
        Map<String, Object> fc = new LinkedHashMap<>();
        fc.put("type", "FeatureCollection");
        fc.put("features", features);
        return fc;
    }
}
