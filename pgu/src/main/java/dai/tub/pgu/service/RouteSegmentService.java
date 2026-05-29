package dai.tub.pgu.service;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import dai.tub.pgu.domain.JourneyPattern;
import dai.tub.pgu.domain.PatternSegment;
import dai.tub.pgu.dto.RouteSegmentDTO;
import dai.tub.pgu.repository.JourneyPatternRepository;
import dai.tub.pgu.repository.PatternSegmentRepository;
import dai.tub.pgu.repository.PatternStopRepository;
import dai.tub.pgu.repository.RouteRepository;

/**
 * Transmodel (Fase 1): a geometria de uma rota deixou de viver em route_segments
 * (tabela removida) e passou a estar distribuida pelos PatternSegment de cada
 * JourneyPattern. Este servico mantem o {@link RouteSegmentDTO} legado.
 *
 * <p>Para a Fase 1 devolve a geometria do <b>padrao representativo</b> da rota
 * (o que tem mais paragens = percurso mais completo). Devolver TODOS os padroes
 * partiria a renderizacao do Livemap, que concatena os segmentos de uma rota
 * numa unica polyline (juntaria shapes distintas com linhas rectas). O "canal"
 * completo (todos os padroes sobrepostos, com toggles) fica para a Fase 3.
 *
 * <p>A edicao manual de segmentos foi descontinuada (a geometria vem do GTFS),
 * pelo que os metodos de escrita lancam {@code 410 GONE}.
 */
@Service
public class RouteSegmentService
{
    private final PatternSegmentRepository patternSegmentRepo;
    private final PatternStopRepository patternStopRepo;
    private final JourneyPatternRepository journeyPatternRepo;
    private final RouteRepository routeRepo;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public RouteSegmentService(PatternSegmentRepository patternSegmentRepo,
                               PatternStopRepository patternStopRepo,
                               JourneyPatternRepository journeyPatternRepo,
                               RouteRepository routeRepo)
    {
        this.patternSegmentRepo = patternSegmentRepo;
        this.patternStopRepo = patternStopRepo;
        this.journeyPatternRepo = journeyPatternRepo;
        this.routeRepo = routeRepo;
    }

    public List<RouteSegmentDTO> getAll()
    {
        // Canal de todas as rotas: itera os padroes de cada rota e agrega os
        // respetivos PatternSegment, resolvendo o routeId via padrao.
        List<RouteSegmentDTO> all = new ArrayList<>();
        routeRepo.findAll().forEach(route ->
            all.addAll(getByRouteId(route.getId())));
        return all;
    }

    public List<RouteSegmentDTO> getByRouteId(Long routeId)
    {
        List<JourneyPattern> patterns =
                journeyPatternRepo.findByRouteIdOrderByDirectionIdAscIdAsc(routeId);
        if (patterns.isEmpty()) return new ArrayList<>();

        // Padrao representativo = o que tem mais paragens (percurso mais completo).
        JourneyPattern rep = patterns.get(0);
        long best = -1;
        for (JourneyPattern p : patterns) {
            long n = patternStopRepo.countByPatternId(p.getId());
            if (n > best) { best = n; rep = p; }
        }

        List<RouteSegmentDTO> segments = new ArrayList<>();
        patternSegmentRepo.findByPatternIdOrderByFromSequence(rep.getId())
            .stream()
            .map(seg -> toDTO(seg, routeId))
            .forEach(segments::add);
        return segments;
    }

    public RouteSegmentDTO create(RouteSegmentDTO dto)
    {
        throw new ResponseStatusException(HttpStatus.GONE,
            "Edicao manual de segmentos descontinuada: a geometria vem da importacao GTFS (PatternSegment).");
    }

    public List<RouteSegmentDTO> createBatch(List<RouteSegmentDTO> dtos)
    {
        throw new ResponseStatusException(HttpStatus.GONE,
            "Edicao manual de segmentos descontinuada: a geometria vem da importacao GTFS (PatternSegment).");
    }

    public RouteSegmentDTO update(Long id, RouteSegmentDTO dto)
    {
        throw new ResponseStatusException(HttpStatus.GONE,
            "Edicao manual de segmentos descontinuada: a geometria vem da importacao GTFS (PatternSegment).");
    }

    /**
     * Mapeia um PatternSegment para o RouteSegmentDTO legado:
     * routeId = rota do padrao, fromStopOrder = fromSequence,
     * toStopOrder = toSequence, points = points.
     */
    private RouteSegmentDTO toDTO(PatternSegment seg, Long routeId)
    {
        RouteSegmentDTO dto = new RouteSegmentDTO();
        dto.setId(seg.getId());
        dto.setRouteId(routeId);
        dto.setFromStopOrder(seg.getFromSequence());
        dto.setToStopOrder(seg.getToSequence());
        dto.setPoints(fromJson(seg.getPoints()));
        return dto;
    }

    private List<List<Double>> fromJson(String json)
    {
        try { return objectMapper.readValue(json, new TypeReference<List<List<Double>>>() {}); }
        catch (JsonProcessingException e) { throw new RuntimeException("Erro ao desserializar pontos", e); }
    }
}
