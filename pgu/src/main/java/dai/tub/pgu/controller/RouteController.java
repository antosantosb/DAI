package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.dto.RouteDTO;
import dai.tub.pgu.service.RouteService;

@RestController
@RequestMapping("/api/v1/routes")
public class RouteController
{
    private final RouteService routeService;

    public RouteController(RouteService routeService)
    {
        this.routeService = routeService;
    }

    @GetMapping
    public ResponseEntity<List<RouteDTO>> getAll()
    {
        List<RouteDTO> routes = routeService.getAll();
        return routes.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(routes);
    }

    @GetMapping("/{id}")
    public ResponseEntity<RouteDTO> getById(@PathVariable Long id)
    {
        return ResponseEntity.ok(routeService.getById(id));
    }

    @PostMapping
    public ResponseEntity<RouteDTO> create(@RequestBody RouteDTO dto)
    {
        return ResponseEntity.status(201).body(routeService.create(dto));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<RouteDTO> update(@PathVariable Long id, @RequestBody RouteDTO dto)
    {
        return ResponseEntity.ok(routeService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id)
    {
        routeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
