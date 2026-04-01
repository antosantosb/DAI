package dai.tub.pgu.service;

import java.util.List;
import java.util.stream.Collectors;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.Route;
import dai.tub.pgu.domain.RouteSegment;
import dai.tub.pgu.dto.RouteSegmentDTO;
import dai.tub.pgu.repository.RouteRepository;
import dai.tub.pgu.repository.RouteSegmentRepository;

@Service
public class RouteSegmentService
{
    private final RouteSegmentRepository segmentRepo;
    private final RouteRepository routeRepo;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public RouteSegmentService(RouteSegmentRepository segmentRepo, RouteRepository routeRepo)
    {
        this.segmentRepo = segmentRepo;
        this.routeRepo = routeRepo;
    }

    public List<RouteSegmentDTO> getAll()
    {
        return segmentRepo.findAll()
            .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<RouteSegmentDTO> getByRouteId(Long routeId)
    {
        return segmentRepo.findByRouteIdOrderByFromStopOrder(routeId)
            .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public RouteSegmentDTO create(RouteSegmentDTO dto)
    {
        Route route = routeRepo.findById(dto.getRouteId())
            .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + dto.getRouteId()));

        RouteSegment seg = new RouteSegment();
        seg.setRoute(route);
        seg.setFromStopOrder(dto.getFromStopOrder());
        seg.setToStopOrder(dto.getToStopOrder());
        seg.setPoints(toJson(dto.getPoints()));

        return toDTO(segmentRepo.save(seg));
    }

    public List<RouteSegmentDTO> createBatch(List<RouteSegmentDTO> dtos)
    {
        return dtos.stream().map(this::create).collect(Collectors.toList());
    }

    public RouteSegmentDTO update(Long id, RouteSegmentDTO dto)
    {
        RouteSegment seg = segmentRepo.findById(id)
            .orElseThrow(() -> new RuntimeException("Segmento não encontrado: " + id));

        if (dto.getPoints() != null)
            seg.setPoints(toJson(dto.getPoints()));
        if (dto.getFromStopOrder() != null)
            seg.setFromStopOrder(dto.getFromStopOrder());
        if (dto.getToStopOrder() != null)
            seg.setToStopOrder(dto.getToStopOrder());

        return toDTO(segmentRepo.save(seg));
    }

    private RouteSegmentDTO toDTO(RouteSegment seg)
    {
        RouteSegmentDTO dto = new RouteSegmentDTO();
        dto.setId(seg.getId());
        dto.setRouteId(seg.getRoute().getId());
        dto.setFromStopOrder(seg.getFromStopOrder());
        dto.setToStopOrder(seg.getToStopOrder());
        dto.setPoints(fromJson(seg.getPoints()));
        return dto;
    }

    private String toJson(List<List<Double>> points)
    {
        try { return objectMapper.writeValueAsString(points); }
        catch (JsonProcessingException e) { throw new RuntimeException("Erro ao serializar pontos", e); }
    }

    private List<List<Double>> fromJson(String json)
    {
        try { return objectMapper.readValue(json, new TypeReference<List<List<Double>>>() {}); }
        catch (JsonProcessingException e) { throw new RuntimeException("Erro ao desserializar pontos", e); }
    }
}
