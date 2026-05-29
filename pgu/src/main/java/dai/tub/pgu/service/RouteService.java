package dai.tub.pgu.service;

import java.util.List;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.domain.JourneyPattern;
import dai.tub.pgu.domain.Operator;
import dai.tub.pgu.domain.PatternStop;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.dto.RouteDTO;
import dai.tub.pgu.dto.RouteStopDTO;
import dai.tub.pgu.repository.JourneyPatternRepository;
import dai.tub.pgu.repository.OperatorRepository;
import dai.tub.pgu.repository.PatternStopRepository;
import dai.tub.pgu.repository.RouteRepository;

@Service
public class RouteService
{
    private final RouteRepository routeRepository;
    private final OperatorRepository operatorRepository;
    private final JourneyPatternRepository journeyPatternRepository;
    private final PatternStopRepository patternStopRepository;

    public RouteService(RouteRepository routeRepository,
                        OperatorRepository operatorRepository,
                        JourneyPatternRepository journeyPatternRepository,
                        PatternStopRepository patternStopRepository)
    {
        this.routeRepository = routeRepository;
        this.operatorRepository = operatorRepository;
        this.journeyPatternRepository = journeyPatternRepository;
        this.patternStopRepository = patternStopRepository;
    }

    // Sprint 0 (F2): cache em memoria (Caffeine, TTL 10min). Rotas mudam raramente
    // mas getAll() e' chamado em cada load do LiveMap. Invalidacao via @CacheEvict
    // nos mutators abaixo.
    @Cacheable("routes")
    public List<RouteDTO> getAll()
    {
        return routeRepository.findAll().stream().map(this::toDTO).toList();
    }

    public RouteDTO getById(Long id)
    {
        Route route = routeRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + id));
        return toDTO(route);
    }

    @Transactional
    @CacheEvict(value = "routes", allEntries = true)
    public RouteDTO create(RouteDTO dto)
    {
        // Upsert com pessimistic lock: serializa acessos concorrentes à mesma rota
        Route route = (dto.getCode() != null)
            ? routeRepository.findByCodeForUpdate(dto.getCode()).orElse(new Route())
            : new Route();

        route.setName(dto.getName());
        route.setCode(dto.getCode());
        route.setColor(dto.getColor());
        applyOperator(route, dto.getOperatorId());

        // Transmodel (Fase 1): a topologia (paragens) e a geometria de uma rota
        // vivem agora nos JourneyPattern / PatternStop / PatternSegment, populados
        // exclusivamente pela importacao GTFS. dto.getStops()/getShapePoints() ja
        // nao sao persistidos a partir deste endpoint; mantemos a assinatura
        // publica intacta para o frontend.
        Route saved = routeRepository.save(route);
        return toDTO(saved);
    }

    @Transactional
    @CacheEvict(value = "routes", allEntries = true)
    public RouteDTO update(Long id, RouteDTO dto)
    {
        Route route = routeRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + id));

        if (dto.getName() != null) route.setName(dto.getName());
        if (dto.getCode() != null) route.setCode(dto.getCode());
        if (dto.getColor() != null) route.setColor(dto.getColor());
        if (dto.getOperatorId() != null) applyOperator(route, dto.getOperatorId());

        // Transmodel (Fase 1): paragens/geometria gerem-se via import GTFS (patterns).
        // dto.getStops()/getShapePoints() nao sao persistidos aqui.
        Route saved = routeRepository.save(route);
        return toDTO(saved);
    }

    @Transactional
    @CacheEvict(value = "routes", allEntries = true)
    public void delete(Long id)
    {
        // Os JourneyPattern (e em cascade os PatternStop/PatternSegment/Trip) sao
        // removidos antes da rota para nao deixar orfaos.
        journeyPatternRepository.deleteByRouteId(id);
        routeRepository.deleteById(id);
    }

    private RouteDTO toDTO(Route entity)
    {
        RouteDTO dto = new RouteDTO();
        dto.setId(entity.getId());
        dto.setName(entity.getName());
        dto.setCode(entity.getCode());
        dto.setColor(entity.getColor());
        dto.setStops(representativeStops(entity.getId()).stream().map(this::toRouteStopDTO).toList());
        if (entity.getOperator() != null) {
            dto.setOperatorId(entity.getOperator().getId());
            dto.setOperatorCode(entity.getOperator().getCode());
            dto.setOperatorName(entity.getOperator().getName());
        }
        return dto;
    }

    /**
     * Transmodel (Fase 1): paragens "da rota" = paragens do padrao representativo.
     * Representativo = o JourneyPattern da rota com MAIS PatternStops (o mais
     * completo). Devolve lista vazia se a rota nao tiver padroes.
     */
    private List<PatternStop> representativeStops(Long routeId)
    {
        if (routeId == null) return List.of();
        List<JourneyPattern> patterns =
                journeyPatternRepository.findByRouteIdOrderByDirectionIdAscIdAsc(routeId);

        List<PatternStop> best = List.of();
        for (JourneyPattern p : patterns) {
            List<PatternStop> stops =
                    patternStopRepository.findByPatternIdOrderByStopSequence(p.getId());
            if (stops.size() > best.size()) {
                best = stops;
            }
        }
        return best;
    }

    /**
     * Sprint 1 (F0): aplica o operador identificado por {@code operatorId} a uma rota.
     * Se {@code operatorId} for {@code null}, mantem o operador anterior. Se for
     * inexistente, lanca erro.
     */
    private void applyOperator(Route route, Long operatorId)
    {
        if (operatorId == null) return;
        Operator op = operatorRepository.findById(operatorId)
                .orElseThrow(() -> new RuntimeException("Operador não encontrado: " + operatorId));
        route.setOperator(op);
    }

    /** Mapeia uma PatternStop para o RouteStopDTO legado (stopSequence -> stopOrder). */
    private RouteStopDTO toRouteStopDTO(PatternStop ps)
    {
        RouteStopDTO dto = new RouteStopDTO();
        dto.setStopId(ps.getStop().getId());
        dto.setStopName(ps.getStop().getName());
        dto.setStopCode(ps.getStop().getCode());
        dto.setStopOrder(ps.getStopSequence());
        if (ps.getStop().getLocation() != null)
        {
            dto.setLongitude(ps.getStop().getLocation().getX());
            dto.setLatitude(ps.getStop().getLocation().getY());
        }
        return dto;
    }
}
