package dai.tub.pgu.service;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.domain.BusStop;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.domain.RouteSegment;
import dai.tub.pgu.domain.RouteStop;
import dai.tub.pgu.dto.RouteDTO;
import dai.tub.pgu.dto.RouteStopDTO;
import dai.tub.pgu.repository.BusStopRepository;
import dai.tub.pgu.repository.RouteRepository;
import dai.tub.pgu.repository.RouteSegmentRepository;
import jakarta.persistence.EntityManager;

@Service
public class RouteService
{
    private static final Logger log = LoggerFactory.getLogger(RouteService.class);

    private final RouteRepository routeRepository;
    private final BusStopRepository busStopRepository;
    private final RouteSegmentRepository segmentRepository;
    private final OsrmService osrmService;
    private final EntityManager entityManager;

    public RouteService(RouteRepository routeRepository, BusStopRepository busStopRepository,
                        RouteSegmentRepository segmentRepository, OsrmService osrmService,
                        EntityManager entityManager)
    {
        this.routeRepository = routeRepository;
        this.busStopRepository = busStopRepository;
        this.segmentRepository = segmentRepository;
        this.osrmService = osrmService;
        this.entityManager = entityManager;
    }

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
    public RouteDTO create(RouteDTO dto)
    {
        Route route = new Route();
        route.setName(dto.getName());
        route.setCode(dto.getCode());
        route.setColor(dto.getColor());

        if (dto.getStops() != null)
        {
            for (RouteStopDTO rsDto : dto.getStops())
            {
                BusStop stop = busStopRepository.findById(rsDto.getStopId())
                        .orElseThrow(() -> new RuntimeException("Paragem não encontrada: " + rsDto.getStopId()));
                RouteStop rs = new RouteStop();
                rs.setRoute(route);
                rs.setStop(stop);
                rs.setStopOrder(rsDto.getStopOrder());
                route.getRouteStops().add(rs);
            }
        }

        Route saved = routeRepository.save(route);

        // Usar shape points do GTFS se disponíveis, senão OSRM
        if (dto.getShapePoints() != null && !dto.getShapePoints().isEmpty())
        {
            saveShapeAsSegment(saved, dto.getShapePoints());
        }
        else
        {
            calculateSegmentsAsync(saved);
        }
        return toDTO(saved);
    }

    @Transactional
    public RouteDTO update(Long id, RouteDTO dto)
    {
        Route route = routeRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + id));

        if (dto.getName() != null) route.setName(dto.getName());
        if (dto.getCode() != null) route.setCode(dto.getCode());
        if (dto.getColor() != null) route.setColor(dto.getColor());

        if (dto.getStops() != null)
        {
            route.getRouteStops().clear();
            entityManager.flush(); // Force DELETE before INSERT to avoid unique constraint violation
            for (RouteStopDTO rsDto : dto.getStops())
            {
                BusStop stop = busStopRepository.findById(rsDto.getStopId())
                        .orElseThrow(() -> new RuntimeException("Paragem não encontrada: " + rsDto.getStopId()));
                RouteStop rs = new RouteStop();
                rs.setRoute(route);
                rs.setStop(stop);
                rs.setStopOrder(rsDto.getStopOrder());
                route.getRouteStops().add(rs);
            }
        }

        Route saved = routeRepository.save(route);

        // Recalcular segmentos quando paragens mudam
        if (dto.getStops() != null)
        {
            if (dto.getShapePoints() != null && !dto.getShapePoints().isEmpty())
            {
                saveShapeAsSegment(saved, dto.getShapePoints());
            }
            else
            {
                calculateSegmentsAsync(saved);
            }
        }
        return toDTO(saved);
    }

    @Transactional
    public void delete(Long id)
    {
        segmentRepository.deleteByRouteId(id);
        routeRepository.deleteById(id);
    }

    /**
     * Guarda a geometria GTFS (shape) como um único segmento para a rota inteira.
     * Mais preciso que OSRM porque usa o percurso real definido pelos TUB.
     */
    @Transactional
    public void saveShapeAsSegment(Route route, List<List<Double>> shapePoints)
    {
        try
        {
            Long routeId = route.getId();
            log.info("[GTFS] A guardar shape para rota {} ({}) com {} pontos", routeId, route.getName(), shapePoints.size());

            // Apagar segmentos antigos
            segmentRepository.deleteByRouteId(routeId);

            int lastStopOrder = route.getRouteStops().stream()
                .mapToInt(RouteStop::getStopOrder)
                .max().orElse(1);

            RouteSegment seg = new RouteSegment();
            seg.setRoute(route);
            seg.setFromStopOrder(1);
            seg.setToStopOrder(lastStopOrder);
            seg.setPoints(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(shapePoints));

            segmentRepository.save(seg);
            log.info("[GTFS] Rota {}: shape guardado com {} pontos", routeId, shapePoints.size());
        }
        catch (Exception e)
        {
            log.error("[GTFS] Erro ao guardar shape para rota {}: {}", route.getId(), e.getMessage());
        }
    }

    /**
     * Calcula segmentos OSRM entre paragens consecutivas de uma rota.
     * Corre em background para não bloquear o request.
     * Usado como fallback quando não há shapes GTFS disponíveis.
     */
    @Async
    @Transactional
    public void calculateSegmentsAsync(Route route)
    {
        try
        {
            Long routeId = route.getId();
            log.info("[OSRM] A calcular segmentos para rota {} ({})", routeId, route.getName());

            // Apagar segmentos antigos
            segmentRepository.deleteByRouteId(routeId);

            // Ordenar paragens
            List<RouteStop> ordered = route.getRouteStops().stream()
                .sorted((a, b) -> a.getStopOrder() - b.getStopOrder())
                .toList();

            if (ordered.size() < 2)
            {
                log.info("[OSRM] Rota {} tem menos de 2 paragens, nada a calcular", routeId);
                return;
            }

            List<RouteSegment> segments = new ArrayList<>();

            for (int i = 0; i < ordered.size() - 1; i++)
            {
                RouteStop a = ordered.get(i);
                RouteStop b = ordered.get(i + 1);

                if (a.getStop().getLocation() == null || b.getStop().getLocation() == null) continue;

                double lat1 = a.getStop().getLocation().getY();
                double lon1 = a.getStop().getLocation().getX();
                double lat2 = b.getStop().getLocation().getY();
                double lon2 = b.getStop().getLocation().getX();

                List<List<Double>> points = osrmService.getRoute(lat1, lon1, lat2, lon2);

                // Fallback: linha reta
                if (points == null || points.size() < 2)
                {
                    points = List.of(List.of(lat1, lon1), List.of(lat2, lon2));
                }

                RouteSegment seg = new RouteSegment();
                seg.setRoute(route);
                seg.setFromStopOrder(a.getStopOrder());
                seg.setToStopOrder(b.getStopOrder());
                seg.setPoints(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(points));
                segments.add(seg);
            }

            segmentRepository.saveAll(segments);
            log.info("[OSRM] Rota {}: {} segmentos calculados e guardados", routeId, segments.size());
        }
        catch (Exception e)
        {
            log.error("[OSRM] Erro ao calcular segmentos para rota {}: {}", route.getId(), e.getMessage());
        }
    }

    private RouteDTO toDTO(Route entity)
    {
        RouteDTO dto = new RouteDTO();
        dto.setId(entity.getId());
        dto.setName(entity.getName());
        dto.setCode(entity.getCode());
        dto.setColor(entity.getColor());
        dto.setStops(entity.getRouteStops().stream().map(this::toRouteStopDTO).toList());
        return dto;
    }

    private RouteStopDTO toRouteStopDTO(RouteStop rs)
    {
        RouteStopDTO dto = new RouteStopDTO();
        dto.setStopId(rs.getStop().getId());
        dto.setStopName(rs.getStop().getName());
        dto.setStopCode(rs.getStop().getCode());
        dto.setStopOrder(rs.getStopOrder());
        if (rs.getStop().getLocation() != null)
        {
            dto.setLongitude(rs.getStop().getLocation().getX());
            dto.setLatitude(rs.getStop().getLocation().getY());
        }
        return dto;
    }
}
