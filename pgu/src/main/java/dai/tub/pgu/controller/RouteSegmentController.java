package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.RouteSegmentDTO;
import dai.tub.pgu.service.RouteSegmentService;

@RestController
@RequestMapping("/api/v1/route-segments")
public class RouteSegmentController
{
    private final RouteSegmentService service;

    public RouteSegmentController(RouteSegmentService service)
    {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<RouteSegmentDTO>> getAll()
    {
        List<RouteSegmentDTO> segments = service.getAll();
        return segments.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(segments);
    }

    @GetMapping("/route/{routeId}")
    public ResponseEntity<List<RouteSegmentDTO>> getByRoute(@PathVariable Long routeId)
    {
        List<RouteSegmentDTO> segments = service.getByRouteId(routeId);
        return segments.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(segments);
    }

    @PostMapping
    @LogActivity(action = "Criar segmento de rota")
    public ResponseEntity<RouteSegmentDTO> create(@RequestBody RouteSegmentDTO dto)
    {
        return ResponseEntity.status(201).body(service.create(dto));
    }

    @PostMapping("/batch")
    @LogActivity(action = "Criar segmentos de rota (batch)")
    public ResponseEntity<List<RouteSegmentDTO>> createBatch(@RequestBody List<RouteSegmentDTO> dtos)
    {
        return ResponseEntity.status(201).body(service.createBatch(dtos));
    }

    @PatchMapping("/{id}")
    @LogActivity(action = "Atualizar segmento de rota")
    public ResponseEntity<RouteSegmentDTO> update(@PathVariable Long id, @RequestBody RouteSegmentDTO dto)
    {
        return ResponseEntity.ok(service.update(id, dto));
    }
}
