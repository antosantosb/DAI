package dai.tub.pgu.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.service.OsrmService;

/**
 * Expoe o servico OSRM interno (container dai-osrm) ao frontend, para o
 * BusScheduleModal poder desenhar deadheads reais entre trips (passando pelas
 * ruas em vez de linha recta).
 *
 * <p>Endpoint:
 * <pre>
 *   GET /api/v1/osrm/route?lat1={}&lon1={}&lat2={}&lon2={}
 *     -> { "points": [[lat, lon], ...] }
 * </pre>
 *
 * <p>Roles: admin / funcionario / developer (definido em SecurityConfig).
 * Em caso de falha do OSRM, devolve {@code { "points": [] }} (nao 5xx, para
 * o frontend cair em fallback de linha recta sem rebentar a UI).
 */
@RestController
@RequestMapping("/api/v1/osrm")
public class OsrmController
{
    private final OsrmService osrmService;

    public OsrmController(OsrmService osrmService)
    {
        this.osrmService = osrmService;
    }

    @GetMapping("/route")
    public Map<String, Object> route(@RequestParam double lat1,
                                     @RequestParam double lon1,
                                     @RequestParam double lat2,
                                     @RequestParam double lon2)
    {
        List<List<Double>> pts = osrmService.getRoute(lat1, lon1, lat2, lon2);
        return Map.of("points", pts != null ? pts : List.of());
    }
}
