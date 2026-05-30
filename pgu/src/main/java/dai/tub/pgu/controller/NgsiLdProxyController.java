package dai.tub.pgu.controller;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.TelemetryRepository;
import dai.tub.pgu.service.NgsiLdService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.server.ResponseStatusException;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Sprint 0 (F3): proxy NGSI-LD sobre o FIWARE Orion (R.INT.06).
 *
 * <p>Exposto em {@code /api/v1/ngsi-ld/**}. Devolve {@code application/ld+json}
 * (Content-Type oficial NGSI-LD v1.6).
 *
 * <p>Endpoints (todos exigem JWT):
 * <ul>
 *   <li>{@code GET /entities?type=Vehicle&limit=100&offset=0}</li>
 *   <li>{@code GET /entities/{id}}</li>
 *   <li>{@code GET /types}</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/ngsi-ld")
@RequiredArgsConstructor
public class NgsiLdProxyController {

    private static final MediaType LD_JSON = MediaType.parseMediaType("application/ld+json");

    private final NgsiLdService service;
    // Sprint 2 (Vertical 3.4, R.ICP.10): fonte das leituras APC para o Smart
    // Data Model PassengerCount. A capacidade vem do autocarro (buses.capacity).
    private final TelemetryRepository telemetryRepository;
    private final BusRepository busRepository;

    @GetMapping(value = "/entities", produces = "application/ld+json")
    public ResponseEntity<List<Map<String, Object>>> listEntities(
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(defaultValue = "0") int offset
    ) {
        List<Map<String, Object>> result = service.listEntities(type, limit, offset);
        return ResponseEntity.ok().contentType(LD_JSON).body(result);
    }

    @GetMapping(value = "/entities/{id}", produces = "application/ld+json")
    public ResponseEntity<Map<String, Object>> getEntity(@PathVariable String id) {
        try {
            Map<String, Object> entity = service.getEntity(id);
            return ResponseEntity.ok().contentType(LD_JSON).body(entity);
        } catch (NgsiLdService.NotFound nf) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, nf.getMessage());
        } catch (HttpClientErrorException.NotFound nf) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Entity " + id + " nao encontrada no Orion");
        }
    }

    @GetMapping(value = "/types", produces = "application/ld+json")
    public ResponseEntity<List<String>> listTypes() {
        return ResponseEntity.ok().contentType(LD_JSON).body(service.listTypes());
    }

    /**
     * Sprint 2 (Vertical 3.4, R.ICP.10): expoe a contagem de passageiros como
     * entidades NGSI-LD no Smart Data Model oficial {@code PassengerCount}.
     *
     * <p>Constroi uma entity por autocarro a partir da ultima telemetria
     * conhecida (onboard/boarded/alighted) e da capacidade do autocarro.
     * Devolve {@code application/ld+json} com @context FIWARE.
     */
    @GetMapping(value = "/passenger-count", produces = "application/ld+json")
    public ResponseEntity<List<Map<String, Object>>> listPassengerCounts() {
        List<VehicleTelemetry> latest = telemetryRepository.findLatestPerBus();
        List<Map<String, Object>> out = new ArrayList<>(latest.size());
        for (VehicleTelemetry t : latest) {
            out.add(toPassengerCount(t));
        }
        return ResponseEntity.ok().contentType(LD_JSON).body(out);
    }

    @GetMapping(value = "/passenger-count/{busId}", produces = "application/ld+json")
    public ResponseEntity<Map<String, Object>> getPassengerCount(@PathVariable String busId) {
        VehicleTelemetry t = telemetryRepository.findLatestByBusId(busId);
        if (t == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Sem telemetria para o autocarro " + busId);
        }
        return ResponseEntity.ok().contentType(LD_JSON).body(toPassengerCount(t));
    }

    private Map<String, Object> toPassengerCount(VehicleTelemetry t) {
        int capacity = busRepository.findByBusCode(t.getBusId())
                .map(Bus::getCapacity)
                .filter(c -> c != null)
                .orElse(0);
        // onboard pode ser null em linhas historicas: usa passenger_count como fallback.
        int onboard = t.getOnboard() != null ? t.getOnboard() : t.getPassengers();
        String observedAt = t.getRecordedAt() != null
                ? DateTimeFormatter.ISO_INSTANT.format(t.getRecordedAt())
                : null;
        return service.buildPassengerCountEntity(
                t.getBusId(), t.getBoarded(), t.getAlighted(), onboard, capacity, observedAt);
    }
}
