package dai.tub.pgu.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.RouteDTO;
import dai.tub.pgu.service.RouteService;

@RestController
@RequestMapping("/api/v1/routes")
public class RouteController
{
    private static final Logger log = LoggerFactory.getLogger(RouteController.class);
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
    @LogActivity(action = "Criar rota")
    public ResponseEntity<RouteDTO> create(@RequestBody RouteDTO dto)
    {
        try
        {
            return ResponseEntity.status(201).body(routeService.create(dto));
        }
        catch (DataIntegrityViolationException | UnexpectedRollbackException e)
        {
            log.info("[UPSERT] Rota '{}' — conflito concorrente ({}), retry como update", dto.getCode(), e.getClass().getSimpleName());
            return ResponseEntity.ok(routeService.create(dto));
        }
    }

    @PatchMapping("/{id}")
    @LogActivity(action = "Atualizar rota")
    public ResponseEntity<RouteDTO> update(@PathVariable Long id, @RequestBody RouteDTO dto)
    {
        return ResponseEntity.ok(routeService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @LogActivity(action = "Eliminar rota")
    public ResponseEntity<Void> delete(@PathVariable Long id)
    {
        routeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
