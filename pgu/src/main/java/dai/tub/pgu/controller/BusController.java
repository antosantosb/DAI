package dai.tub.pgu.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.BusDTO;
import dai.tub.pgu.service.BusDutyService;
import dai.tub.pgu.service.BusService;
import dai.tub.pgu.service.DriverDepartureService;

@RestController
@RequestMapping("/api/v1/buses")
@Validated
public class BusController
{
    private final BusService busService;
    private final BusDutyService busDutyService;
    private final DriverDepartureService driverDepartureService;

    public BusController(BusService busService,
                         BusDutyService busDutyService,
                         DriverDepartureService driverDepartureService)
    {
        this.busService = busService;
        this.busDutyService = busDutyService;
        this.driverDepartureService = driverDepartureService;
    }

    @GetMapping
    public ResponseEntity<List<BusDTO>> getAll()
    {
        List<BusDTO> buses = busService.getAll();
        return buses.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(buses);
    }

    @GetMapping("/{id}")
    public ResponseEntity<BusDTO> getById(@PathVariable Long id)
    {
        return ResponseEntity.ok(busService.getById(id));
    }

    @GetMapping("/code/{busCode}")
    public ResponseEntity<BusDTO> getByCode(@PathVariable String busCode)
    {
        return ResponseEntity.ok(busService.getByCode(busCode));
    }

    @PostMapping
    @LogActivity(action = "Criar autocarro")
    public ResponseEntity<BusDTO> create(@RequestBody BusDTO dto)
    {
        return ResponseEntity.status(201).body(busService.create(dto));
    }

    /**
     * Sprint -1 (BE-8): validacao declarativa com @Min/@Max.
     * Erros devolvem 400 (via GlobalExceptionHandler) em vez de 500.
     */
    /**
     * Sprint 1 follow-up: batch generation movido para a role `developer`
     * (antes admin). Faz parte do toolkit de demo, nao da gestao normal.
     */
    @PostMapping("/batch")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('developer')")
    @LogActivity(action = "Criar autocarros em batch")
    public ResponseEntity<List<BusDTO>> createBatch(
            @RequestParam(defaultValue = "5")
            @Min(value = 1, message = "Quantidade minima e 1")
            @Max(value = 50, message = "Quantidade maxima e 50")
            int count)
    {
        return ResponseEntity.status(201).body(busService.createBatch(count));
    }

    @PatchMapping("/{id}")
    @LogActivity(action = "Atualizar autocarro")
    public ResponseEntity<BusDTO> update(@PathVariable Long id, @RequestBody BusDTO dto)
    {
        return ResponseEntity.ok(busService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @LogActivity(action = "Eliminar autocarro")
    public ResponseEntity<Void> delete(@PathVariable Long id)
    {
        busService.delete(id);
        return ResponseEntity.noContent().build();
    }

    // ============================================================
    // Fase E (E-back-2): operacoes de estado + escala.
    // ============================================================

    /**
     * Iniciar Servico: STOPPED -> EM_SERVICO. Aplica os 4 gates (existe e
     * STOPPED, motorista, sensor, escala de hoje com proxima trip no futuro)
     * e marca a primeira duty PLANNED como RUNNING. Usado pelo motorista no
     * painel de bordo; tambem disponivel para admin/developer (devtools).
     */
    @PostMapping("/{id}/start")
    @LogActivity(action = "Iniciar servico do autocarro")
    public ResponseEntity<BusDTO> startService(@PathVariable Long id,
                                               @org.springframework.web.bind.annotation.RequestBody(required = false) java.util.Map<String, Object> body)
    {
        BusDTO bus = busService.startService(id);
        // "Hora X": se o frontend enviar departureType (EARLY/ON_TIME/LATE),
        // regista na primeira duty da escala. Best-effort, nao parte o /start.
        if (body != null && body.get("departureType") instanceof String dt && !dt.isBlank()) {
            try { driverDepartureService.recordActualDeparture(id, dt); }
            catch (Exception ignored) { /* nao critico */ }
        }
        return ResponseEntity.ok(bus);
    }

    /**
     * Terminar Servico: EM_SERVICO -> STOPPING. Cancela duties PLANNED e
     * marca a RUNNING como INTERRUPTED. A transicao STOPPING -> STOPPED e'
     * feita pelo simulador (arrived).
     */
    @PostMapping("/{id}/end")
    @LogActivity(action = "Terminar servico do autocarro")
    public ResponseEntity<BusDTO> endService(@PathVariable Long id)
    {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String by = auth != null ? auth.getName() : "?";
        return ResponseEntity.ok(busService.endService(id, "TERMINATED_BY_DRIVER:" + by));
    }

    /**
     * Chegou a central (m2m, X-API-Key): STOPPING -> STOPPED. Idempotente.
     */
    @PostMapping("/{id}/arrived")
    public ResponseEntity<BusDTO> arrived(@PathVariable Long id)
    {
        return ResponseEntity.ok(busService.arrived(id));
    }

    /**
     * Chegou a primeira paragem da escala (m2m, X-API-Key):
     * STARTING -> EM_SERVICO + promove a 1a duty PLANNED para RUNNING.
     * Idempotente.
     */
    @PostMapping("/{id}/in-service")
    public ResponseEntity<BusDTO> inServiceArrived(@PathVariable Long id)
    {
        return ResponseEntity.ok(busService.inServiceArrived(id));
    }

    /**
     * Simulador (m2m, X-API-Key): uma trip RUNNING chegou ao destino. Marca
     * essa duty DONE e promove a proxima PLANNED (se houver) a RUNNING.
     * Devolve {nextTripId} ou {nextTripId: null} quando a escala terminou.
     */
    @PostMapping("/{busId}/duties/{tripId}/complete")
    public ResponseEntity<Map<String, Object>> completeTrip(@PathVariable Long busId,
                                                            @PathVariable Long tripId)
    {
        Long nextTripId = busDutyService.completeTripIfArrived(busId, tripId);
        // HashMap (em vez de Map.of) porque o valor pode ser null quando a
        // escala de hoje terminou sem proxima trip.
        Map<String, Object> body = new HashMap<>();
        body.put("nextTripId", nextTripId);
        return ResponseEntity.ok(body);
    }

    /**
     * Simulador (m2m, X-API-Key): toda a escala de hoje ficou DONE/CANCELLED.
     * Transita o bus EM_SERVICO -> STOPPING. Idempotente em STOPPING/STOPPED.
     */
    @PostMapping("/{id}/duties-complete")
    public ResponseEntity<BusDTO> dutiesComplete(@PathVariable Long id)
    {
        return ResponseEntity.ok(busService.dutiesComplete(id));
    }
}
