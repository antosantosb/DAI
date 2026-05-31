package dai.tub.pgu.controller;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.BusDutyDTO;
import dai.tub.pgu.service.BusDutyService;

/**
 * Fase E (E-back-1): endpoints da escala (bus_duty).
 *
 * Contrato:
 *   POST   /api/v1/buses/{busId}/duties            { patternId, serviceDate, tripIds[] } -> 201
 *   GET    /api/v1/buses/{busId}/duties?date=...                                          -> 200
 *   DELETE /api/v1/buses/{busId}/duties?date=...                                          -> 204
 *   GET    /api/v1/duties?date=...                                                        -> 200
 *
 * Roles (impostas em SecurityConfig): admin, funcionario, developer.
 */
@RestController
public class BusDutyController
{
    private final BusDutyService dutyService;

    public BusDutyController(BusDutyService dutyService)
    {
        this.dutyService = dutyService;
    }

    /**
     * Body de criacao da escala.
     *
     * Exemplo:
     *   {
     *     "patternId": 12,
     *     "serviceDate": "2026-06-02",
     *     "tripIds": [101, 102, 103]
     *   }
     */
    public static class CreateDutyRequest
    {
        private Long patternId;
        private LocalDate serviceDate;
        private List<Long> tripIds;

        public Long getPatternId()             { return patternId; }
        public void setPatternId(Long id)      { this.patternId = id; }
        public LocalDate getServiceDate()      { return serviceDate; }
        public void setServiceDate(LocalDate d){ this.serviceDate = d; }
        public List<Long> getTripIds()         { return tripIds; }
        public void setTripIds(List<Long> ids) { this.tripIds = ids; }
    }

    @PostMapping("/api/v1/buses/{busId}/duties")
    @LogActivity(action = "Criar escala de autocarro")
    public ResponseEntity<List<BusDutyDTO>> createDuty(@PathVariable Long busId,
                                                       @RequestBody CreateDutyRequest body)
    {
        List<BusDutyDTO> created = dutyService.createDuty(
                busId,
                body.getPatternId(),
                body.getServiceDate(),
                body.getTripIds());
        return ResponseEntity.status(201).body(created);
    }

    @GetMapping("/api/v1/buses/{busId}/duties")
    public ResponseEntity<List<BusDutyDTO>> listForBus(
            @PathVariable Long busId,
            @RequestParam("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date)
    {
        return ResponseEntity.ok(dutyService.listForBusOnDate(busId, date));
    }

    @DeleteMapping("/api/v1/buses/{busId}/duties")
    @LogActivity(action = "Apagar escala de autocarro")
    public ResponseEntity<Void> deleteForBus(
            @PathVariable Long busId,
            @RequestParam("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date)
    {
        dutyService.deleteDuty(busId, date);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/v1/duties")
    public ResponseEntity<List<BusDutyDTO>> listForDate(
            @RequestParam("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date)
    {
        return ResponseEntity.ok(dutyService.listForDate(date));
    }

    /**
     * Sumario para a vista mensal do Calendar (substitui o antigo /calendar
     * que vinha do GTFS calendar.txt). Agora preenchido pelas escalas
     * (bus_duty) que nos criamos. Shape compativel com o frontend:
     * {@code { hasData, days: [{ date, totalTrips, routeCount }] }}.
     */
    @GetMapping("/api/v1/duties/summary")
    public ResponseEntity<Map<String, Object>> summary(
            @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam("to")   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to)
    {
        return ResponseEntity.ok(dutyService.getCalendarSummary(from, to));
    }
}
