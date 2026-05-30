package dai.tub.pgu.service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import dai.tub.pgu.domain.BusStop;
import dai.tub.pgu.domain.JourneyPattern;
import dai.tub.pgu.domain.PatternSegment;
import dai.tub.pgu.domain.PatternStop;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.dto.PatternAuthoringDTO.CreatePatternRequest;
import dai.tub.pgu.dto.PatternAuthoringDTO.PatternPoint;
import dai.tub.pgu.dto.PatternAuthoringDTO.PointType;
import dai.tub.pgu.repository.BusStopRepository;
import dai.tub.pgu.repository.JourneyPatternRepository;
import dai.tub.pgu.repository.PatternSegmentRepository;
import dai.tub.pgu.repository.PatternStopRepository;
import dai.tub.pgu.repository.RouteRepository;
import dai.tub.pgu.repository.TripRepository;
import dai.tub.pgu.repository.TripStopTimeRepository;

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
    private final TripStopTimeRepository tripStopTimeRepo;
    private final RouteRepository routeRepo;
    private final BusStopRepository busStopRepo;
    private final OsrmService osrmService;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PatternService(JourneyPatternRepository patternRepo,
                          PatternStopRepository patternStopRepo,
                          PatternSegmentRepository patternSegmentRepo,
                          TripRepository tripRepo,
                          TripStopTimeRepository tripStopTimeRepo,
                          RouteRepository routeRepo,
                          BusStopRepository busStopRepo,
                          OsrmService osrmService,
                          JdbcTemplate jdbcTemplate)
    {
        this.patternRepo = patternRepo;
        this.patternStopRepo = patternStopRepo;
        this.patternSegmentRepo = patternSegmentRepo;
        this.tripRepo = tripRepo;
        this.tripStopTimeRepo = tripStopTimeRepo;
        this.routeRepo = routeRepo;
        this.busStopRepo = busStopRepo;
        this.osrmService = osrmService;
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

    // ===================================================================
    // Sprint 1 (Fase 2): autoria manual de padroes a partir do mapa.
    // ===================================================================

    /**
     * Preview da geometria ajustada as estradas (OSRM) por uma sequencia ordenada
     * de pontos [lat, lon] (stops E waypoints, apenas coordenadas). Devolve a
     * polyline ajustada [[lat,lon], ...]. Com menos de 2 pontos, ou se o OSRM nao
     * devolver nada, devolve os pontos de entrada inalterados (a UI desenha entao
     * uma recta como fallback).
     */
    public List<List<Double>> previewGeometry(List<List<Double>> points)
    {
        if (points == null || points.size() < 2) return points == null ? new ArrayList<>() : points;

        List<double[]> coords = new ArrayList<>();
        for (List<Double> p : points)
        {
            if (p == null || p.size() < 2 || p.get(0) == null || p.get(1) == null) continue;
            coords.add(new double[] { p.get(0), p.get(1) });
        }
        if (coords.size() < 2) return points;

        List<List<Double>> snapped = osrmService.getRouteThrough(coords);
        return (snapped != null && snapped.size() >= 2) ? snapped : points;
    }

    /**
     * Cria um padrao (JourneyPattern) manualmente a partir de uma sequencia ordenada
     * de pontos: STOPs (guardadas) e WAYPOINTs (apenas para moldar a geometria).
     *
     * Logica:
     *  1. valida a rota e exige pelo menos 2 STOPs (senao 400);
     *  2. as STOPs em ordem viram PatternStop (stopSequence 1..N);
     *  3. TODOS os pontos (stops + waypoints) em ordem alimentam o OSRM -> geometria
     *     ajustada, guardada como um PatternSegment (points = JSON [[lat,lon],...],
     *     igual ao import GTFS);
     *  4. signature = SHA-256 hex de "directionId:stopId1,stopId2,...," (mesmo esquema
     *     do import). Se ja' existir um padrao com essa assinatura na rota -> 409.
     *
     * Devolve o padrao criado no MESMO formato de {@link #getByRoute(Long)}
     * (id, directionId, name, stopCount, tripCount) com tripCount = 0.
     */
    @Transactional
    @CacheEvict(value = "routes", allEntries = true)
    public Map<String, Object> createPattern(Long routeId, CreatePatternRequest req)
    {
        Route route = routeRepo.findById(routeId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Rota não encontrada: " + routeId));

        if (req == null || req.getPoints() == null || req.getPoints().isEmpty())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Nenhum ponto fornecido para o padrão.");

        // Apenas as STOPs (em ordem), validando stopId e existencia da paragem.
        List<BusStop> orderedStops = new ArrayList<>();
        for (PatternPoint p : req.getPoints())
        {
            if (p.getType() != PointType.STOP) continue;
            if (p.getStopId() == null)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Ponto STOP sem stopId.");
            BusStop stop = busStopRepo.findById(p.getStopId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Paragem não encontrada: " + p.getStopId()));
            orderedStops.add(stop);
        }

        if (orderedStops.size() < 2)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Um padrão requer pelo menos 2 paragens (STOP).");

        int directionId = req.getDirectionId() != null ? req.getDirectionId() : 0;

        // Assinatura: mesmo esquema do import GTFS (GtfsService.sha256Hex):
        // directionId + ":" + stopId1 + "," + stopId2 + "," + ... (virgula a seguir a cada id).
        StringBuilder sigSb = new StringBuilder().append(directionId).append(':');
        for (BusStop s : orderedStops) sigSb.append(s.getId()).append(',');
        String signature = sha256Hex(sigSb.toString());

        // Dedup por rota (constraint UNIQUE(route_id, signature)).
        if (patternRepo.findByRouteIdAndSignature(routeId, signature).isPresent())
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Já existe um padrão com esta sequência de paragens nesta rota.");

        // 1. JourneyPattern
        JourneyPattern jp = new JourneyPattern();
        jp.setRoute(route);
        jp.setDirectionId(directionId);
        jp.setSignature(signature);
        jp.setName(req.getName() != null && !req.getName().isBlank() ? req.getName().trim() : null);
        // Sequencia de autoria (STOPs + WAYPOINTs) serializada para reabrir no editor.
        jp.setAuthoringPoints(serializeAuthoring(req.getPoints()));
        jp = patternRepo.save(jp);

        // 2. PatternStops (stopSequence 1..N)
        List<PatternStop> psBatch = new ArrayList<>();
        int seq = 1;
        for (BusStop stop : orderedStops)
        {
            PatternStop ps = new PatternStop();
            ps.setPattern(jp);
            ps.setStop(stop);
            ps.setStopSequence(seq++);
            psBatch.add(ps);
        }
        patternStopRepo.saveAll(psBatch);

        // 3. Geometria: OSRM por TODOS os pontos (stops + waypoints) em ordem.
        //    Fallback: recta pelos pontos de entrada. Guardada como UM PatternSegment
        //    (points = JSON [[lat,lon],...]), igual ao import GTFS.
        List<double[]> allCoords = new ArrayList<>();
        for (PatternPoint p : req.getPoints())
        {
            double lat, lon;
            if (p.getLat() != null && p.getLon() != null)
            {
                lat = p.getLat();
                lon = p.getLon();
            }
            else if (p.getType() == PointType.STOP && p.getStopId() != null)
            {
                // STOP sem coordenadas no pedido: usa a geometria da paragem (lat/lon).
                BusStop s = busStopRepo.findById(p.getStopId()).orElse(null);
                if (s == null || s.getLocation() == null) continue;
                lat = s.getLocation().getY();
                lon = s.getLocation().getX();
            }
            else continue;
            allCoords.add(new double[] { lat, lon });
        }

        List<List<Double>> geom = allCoords.size() >= 2 ? osrmService.getRouteThrough(allCoords) : null;
        if (geom == null || geom.size() < 2)
        {
            geom = new ArrayList<>();
            for (double[] c : allCoords) geom.add(List.of(c[0], c[1]));
        }

        if (geom.size() >= 2)
        {
            try
            {
                PatternSegment segEntity = new PatternSegment();
                segEntity.setPattern(jp);
                segEntity.setFromSequence(1);
                segEntity.setToSequence(orderedStops.size());
                segEntity.setPoints(objectMapper.writeValueAsString(geom));
                patternSegmentRepo.save(segEntity);
            }
            catch (com.fasterxml.jackson.core.JsonProcessingException e)
            {
                // Geometria nao serializavel: o padrao fica sem segmento (a UI cai na recta).
            }
        }

        // Resposta: MESMO formato de getByRoute (id, directionId, name, stopCount, tripCount).
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", jp.getId());
        m.put("directionId", jp.getDirectionId());
        m.put("name", jp.getName());
        m.put("stopCount", (long) orderedStops.size());
        m.put("tripCount", 0L);
        return m;
    }

    /**
     * Sequencia de autoria de um padrao, para reabrir no editor do mapa. Devolve
     * {@code { directionId, name, points: [ {type, stopId?, lat, lon}, ... ] }}.
     *
     * Se o padrao tiver authoring_points guardados (foi criado/editado manualmente),
     * devolve essa sequencia exacta (STOPs + WAYPOINTs/ancoras). Caso contrario
     * (padrao importado de GTFS, authoring_points a null), reconstroi os pontos a
     * partir das PatternStops em ordem de stop_sequence, cada uma como STOP com as
     * coordenadas da paragem (sem ancoras). 404 se o padrao nao existir.
     */
    public Map<String, Object> getAuthoring(Long patternId)
    {
        JourneyPattern jp = patternRepo.findById(patternId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Padrão não encontrado: " + patternId));

        List<Map<String, Object>> points = new ArrayList<>();

        String authoring = jp.getAuthoringPoints();
        if (authoring != null && !authoring.isBlank())
        {
            try
            {
                // Reutiliza a sequencia guardada (type/stopId/lat/lon) tal e qual.
                List<PatternPoint> stored = objectMapper.readValue(authoring,
                        new TypeReference<List<PatternPoint>>() {});
                for (PatternPoint p : stored)
                {
                    Map<String, Object> mp = new LinkedHashMap<>();
                    mp.put("type", p.getType() != null ? p.getType().name() : PointType.STOP.name());
                    if (p.getType() == PointType.STOP) mp.put("stopId", p.getStopId());
                    mp.put("lat", p.getLat());
                    mp.put("lon", p.getLon());
                    points.add(mp);
                }
            }
            catch (Exception ignored)
            {
                // authoring_points corrompido: cai no fallback pelas paragens.
                points.clear();
            }
        }

        if (points.isEmpty())
        {
            // Fallback (padrao GTFS ou authoring invalido): paragens em sequencia, sem ancoras.
            for (PatternStop ps : patternStopRepo.findByPatternIdOrderByStopSequence(patternId))
            {
                BusStop stop = ps.getStop();
                Map<String, Object> mp = new LinkedHashMap<>();
                mp.put("type", PointType.STOP.name());
                mp.put("stopId", stop.getId());
                if (stop.getLocation() != null)
                {
                    mp.put("lat", stop.getLocation().getY());
                    mp.put("lon", stop.getLocation().getX());
                }
                else
                {
                    mp.put("lat", null);
                    mp.put("lon", null);
                }
                points.add(mp);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("directionId", jp.getDirectionId());
        out.put("name", jp.getName());
        out.put("points", points);
        return out;
    }

    /**
     * Edita um padrao (JourneyPattern) existente, substituindo-o no lugar a partir
     * de uma nova sequencia ordenada de STOPs e WAYPOINTs (mesmo formato da criacao).
     *
     * Logica (analoga a {@link #createPattern}):
     *  1. valida que a rota e o padrao existem e pertencem um ao outro;
     *  2. exige pelo menos 2 STOPs (senao 400);
     *  3. recalcula a assinatura (mesmo esquema SHA-256). Dedup por rota: 409 apenas
     *     se a nova assinatura colidir com um padrao DIFERENTE da mesma rota (a propria
     *     pode manter ou mudar para a sua nova assinatura);
     *  4. apaga as PatternStops e PatternSegment(s) actuais e recria-as a partir do
     *     pedido (STOPs -> PatternStop 1..N; todos os pontos -> OSRM -> geometria);
     *  5. actualiza name, directionId, signature e authoring_points (re-serializados).
     *
     * Devolve o padrao no MESMO formato de {@link #getByRoute(Long)}
     * (id, directionId, name, stopCount, tripCount) com o tripCount actual.
     */
    @Transactional
    @CacheEvict(value = "routes", allEntries = true)
    public Map<String, Object> updatePattern(Long routeId, Long patternId, CreatePatternRequest req)
    {
        Route route = routeRepo.findById(routeId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Rota não encontrada: " + routeId));

        JourneyPattern jp = patternRepo.findById(patternId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Padrão não encontrado: " + patternId));

        if (jp.getRoute() == null || !jp.getRoute().getId().equals(route.getId()))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "O padrão " + patternId + " não pertence à rota " + routeId + ".");

        if (req == null || req.getPoints() == null || req.getPoints().isEmpty())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Nenhum ponto fornecido para o padrão.");

        // Apenas as STOPs (em ordem), validando stopId e existencia da paragem.
        List<BusStop> orderedStops = new ArrayList<>();
        for (PatternPoint p : req.getPoints())
        {
            if (p.getType() != PointType.STOP) continue;
            if (p.getStopId() == null)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Ponto STOP sem stopId.");
            BusStop stop = busStopRepo.findById(p.getStopId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Paragem não encontrada: " + p.getStopId()));
            orderedStops.add(stop);
        }

        if (orderedStops.size() < 2)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Um padrão requer pelo menos 2 paragens (STOP).");

        int directionId = req.getDirectionId() != null ? req.getDirectionId() : 0;

        // Assinatura: mesmo esquema do import GTFS (GtfsService.sha256Hex):
        // directionId + ":" + stopId1 + "," + stopId2 + "," + ... (virgula a seguir a cada id).
        StringBuilder sigSb = new StringBuilder().append(directionId).append(':');
        for (BusStop s : orderedStops) sigSb.append(s.getId()).append(',');
        String signature = sha256Hex(sigSb.toString());

        // Dedup por rota (constraint UNIQUE(route_id, signature)) ignorando o proprio
        // padrao: so' colide se a nova assinatura ja' pertencer a OUTRO padrao da rota.
        Optional<JourneyPattern> clash = patternRepo.findByRouteIdAndSignature(routeId, signature);
        if (clash.isPresent() && !clash.get().getId().equals(patternId))
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Já existe outro padrão com esta sequência de paragens nesta rota.");

        // Substituicao no lugar: limpa paragens e geometria actuais antes de repopular.
        patternSegmentRepo.deleteByPatternId(patternId);
        patternStopRepo.deleteByPatternId(patternId);
        patternStopRepo.flush();
        patternSegmentRepo.flush();

        // 1. Actualiza os campos do proprio JourneyPattern.
        jp.setDirectionId(directionId);
        jp.setSignature(signature);
        jp.setName(req.getName() != null && !req.getName().isBlank() ? req.getName().trim() : null);
        jp.setAuthoringPoints(serializeAuthoring(req.getPoints()));
        jp = patternRepo.save(jp);

        // 2. PatternStops (stopSequence 1..N)
        List<PatternStop> psBatch = new ArrayList<>();
        int seq = 1;
        for (BusStop stop : orderedStops)
        {
            PatternStop ps = new PatternStop();
            ps.setPattern(jp);
            ps.setStop(stop);
            ps.setStopSequence(seq++);
            psBatch.add(ps);
        }
        patternStopRepo.saveAll(psBatch);

        // 3. Geometria: OSRM por TODOS os pontos (stops + waypoints) em ordem.
        //    Fallback: recta pelos pontos de entrada. Guardada como UM PatternSegment
        //    (points = JSON [[lat,lon],...]), igual ao import GTFS e a criacao.
        List<double[]> allCoords = new ArrayList<>();
        for (PatternPoint p : req.getPoints())
        {
            double lat, lon;
            if (p.getLat() != null && p.getLon() != null)
            {
                lat = p.getLat();
                lon = p.getLon();
            }
            else if (p.getType() == PointType.STOP && p.getStopId() != null)
            {
                // STOP sem coordenadas no pedido: usa a geometria da paragem (lat/lon).
                BusStop s = busStopRepo.findById(p.getStopId()).orElse(null);
                if (s == null || s.getLocation() == null) continue;
                lat = s.getLocation().getY();
                lon = s.getLocation().getX();
            }
            else continue;
            allCoords.add(new double[] { lat, lon });
        }

        List<List<Double>> geom = allCoords.size() >= 2 ? osrmService.getRouteThrough(allCoords) : null;
        if (geom == null || geom.size() < 2)
        {
            geom = new ArrayList<>();
            for (double[] c : allCoords) geom.add(List.of(c[0], c[1]));
        }

        if (geom.size() >= 2)
        {
            try
            {
                PatternSegment segEntity = new PatternSegment();
                segEntity.setPattern(jp);
                segEntity.setFromSequence(1);
                segEntity.setToSequence(orderedStops.size());
                segEntity.setPoints(objectMapper.writeValueAsString(geom));
                patternSegmentRepo.save(segEntity);
            }
            catch (com.fasterxml.jackson.core.JsonProcessingException e)
            {
                // Geometria nao serializavel: o padrao fica sem segmento (a UI cai na recta).
            }
        }

        // Resposta: MESMO formato de getByRoute (id, directionId, name, stopCount, tripCount).
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", jp.getId());
        m.put("directionId", jp.getDirectionId());
        m.put("name", jp.getName());
        m.put("stopCount", (long) orderedStops.size());
        m.put("tripCount", tripRepo.countByPatternId(jp.getId()));
        return m;
    }

    /**
     * Apaga um padrao (JourneyPattern) e TODOS os seus filhos, validando primeiro que
     * existe e pertence a rota indicada (404 se nao existir; 400 se for de outra rota).
     *
     * Ordem segura para as FKs (filhos antes do pai):
     *  1. trip_stop_time das trips do padrao (FK trip_id), depois as proprias Trips
     *     (FK pattern_id). Um padrao importado de GTFS tem muitas trips; um padrao
     *     autorado a mao nao tem nenhuma;
     *  2. PatternSegment(s) e PatternStop(s) do padrao (FK pattern_id);
     *  3. o proprio JourneyPattern.
     * Os flush() entre passos garantem que os DELETEs vao a base de dados pela ordem
     * certa dentro da transacao, antes de remover o pai.
     */
    @Transactional
    @CacheEvict(value = "routes", allEntries = true)
    public void deletePattern(Long routeId, Long patternId)
    {
        JourneyPattern jp = patternRepo.findById(patternId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Padrão não encontrado: " + patternId));

        if (jp.getRoute() == null || !jp.getRoute().getId().equals(routeId))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "O padrão " + patternId + " não pertence à rota " + routeId + ".");

        // 1. Trips e os seus passing-times (trip_stop_time ANTES das trips, pela FK trip_id).
        tripStopTimeRepo.deleteByPatternId(patternId);
        tripStopTimeRepo.flush();
        tripRepo.deleteByPatternId(patternId);
        tripRepo.flush();

        // 2. Geometria e paragens do padrao.
        patternSegmentRepo.deleteByPatternId(patternId);
        patternStopRepo.deleteByPatternId(patternId);
        patternSegmentRepo.flush();
        patternStopRepo.flush();

        // 3. O proprio padrao.
        patternRepo.delete(jp);
    }

    /**
     * Serializa a sequencia de autoria (STOPs + WAYPOINTs, com type/stopId/lat/lon)
     * para JSON, a guardar em journey_pattern.authoring_points. Devolve null se a
     * lista for nula/vazia ou se a serializacao falhar (o padrao fica sem autoria
     * guardada e o editor cai no fallback pelas paragens).
     */
    private String serializeAuthoring(List<PatternPoint> points)
    {
        if (points == null || points.isEmpty()) return null;
        try
        {
            return objectMapper.writeValueAsString(points);
        }
        catch (com.fasterxml.jackson.core.JsonProcessingException e)
        {
            return null;
        }
    }

    /**
     * SHA-256 em hex (64 chars) da string dada. Identico ao GtfsService.sha256Hex,
     * para que a deduplicacao por assinatura seja consistente com o import GTFS.
     */
    private static String sha256Hex(String s)
    {
        try
        {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : d) sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            return sb.toString();
        }
        catch (Exception e)
        {
            return Integer.toHexString(s.hashCode());
        }
    }
}
