package dai.tub.pgu.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.service.ScheduleService;

/**
 * Sprint 1 (F4): horários planeados (R.IVT.05).
 * Autenticado (ferramenta interna) — coberto pelo catch-all GET /api/v1/**.
 */
@RestController
@RequestMapping("/api/v1/schedules")
public class ScheduleController
{
    private final ScheduleService scheduleService;

    public ScheduleController(ScheduleService scheduleService)
    {
        this.scheduleService = scheduleService;
    }

    /** Cobertura por rota (nº de trips, inclui rotas sem horário). */
    @GetMapping("/coverage")
    public ResponseEntity<List<Map<String, Object>>> coverage()
    {
        return ResponseEntity.ok(scheduleService.getCoverage());
    }

    /** Trips de uma rota. */
    @GetMapping("/trips")
    public ResponseEntity<List<Map<String, Object>>> trips(@RequestParam Long routeId)
    {
        return ResponseEntity.ok(scheduleService.getTrips(routeId));
    }

    /** Paragens + horas de uma trip. */
    @GetMapping("/trips/{tripId}/stops")
    public ResponseEntity<List<Map<String, Object>>> tripStops(@PathVariable String tripId)
    {
        return ResponseEntity.ok(scheduleService.getTripStops(tripId));
    }
}
