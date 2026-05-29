package dai.tub.pgu.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.service.PatternService;

/**
 * Sprint 1 (Fase 1/2): endpoints dos padrões (JourneyPattern) de uma rota.
 * Autenticados (catch-all GET /api/v1/** no SecurityConfig).
 */
@RestController
@RequestMapping("/api/v1")
public class PatternController
{
    private final PatternService patternService;

    public PatternController(PatternService patternService)
    {
        this.patternService = patternService;
    }

    /** Padrões de uma rota. */
    @GetMapping("/routes/{routeId}/patterns")
    public List<Map<String, Object>> byRoute(@PathVariable Long routeId)
    {
        return patternService.getByRoute(routeId);
    }

    /** Geometria de um padrão (para destacar no mapa). */
    @GetMapping("/patterns/{patternId}/geometry")
    public Map<String, Object> geometry(@PathVariable Long patternId)
    {
        return patternService.getGeometry(patternId);
    }

    /** Paragens de um padrão. */
    @GetMapping("/patterns/{patternId}/stops")
    public List<Map<String, Object>> stops(@PathVariable Long patternId)
    {
        return patternService.getStops(patternId);
    }

    /** Trips (horários) de um padrão. */
    @GetMapping("/patterns/{patternId}/trips")
    public List<Map<String, Object>> trips(@PathVariable Long patternId)
    {
        return patternService.getTrips(patternId);
    }
}
