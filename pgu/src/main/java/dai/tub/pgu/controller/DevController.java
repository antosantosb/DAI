package dai.tub.pgu.controller;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.BusDuty;
import dai.tub.pgu.domain.Trip;
import dai.tub.pgu.repository.BusDutyRepository;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.DriverBusAssignmentRepository;
import dai.tub.pgu.repository.TripRepository;
import dai.tub.pgu.repository.VehicleSensorRepository;

/**
 * Sprint 5 (follow-up): endpoints utilitarios so' para developer.
 *
 * <p>{@code POST /api/v1/dev/quick-duty?busId=X[&minutes=1]}
 *    Força uma escala FIXA de 2 trips conhecidas no bus indicado, com arranque
 *    daqui a {@code minutes} min. Bypassa o filtro "início > agora" do
 *    createDuty. Pré-requisitos: bus em STOPPED, com motorista activo e
 *    sensor atribuído. Limpa automaticamente duties PLANNED anteriores do
 *    mesmo bus em service_date = hoje, para o teste ser sempre repetivel.</p>
 *
 * <p>Escala teste (sempre a mesma):
 *  - Trip 1: rota "2", direction 1 (outbound), headsign ~"BOM JESUS"
 *  - Trip 2: rota "43", direction 0 (inbound), headsign ~"ESTAÇÃO CF"
 *  Fallback (se trip especifica nao existir): 1a trip livre na rota.</p>
 *
 * <p>{@code GET /api/v1/dev/quick-duty/eligible-buses} devolve a lista de
 *    buses elegiveis (STOPPED + motorista + sensor) para o select da UI.</p>
 */
@RestController
@RequestMapping("/api/v1/dev")
@PreAuthorize("hasRole('developer')")
public class DevController
{
    private static final Logger log = LoggerFactory.getLogger(DevController.class);
    private static final ZoneId LISBON = ZoneId.of("Europe/Lisbon");

    // Especificacao da escala teste (sempre a mesma).
    private static final TripSpec TRIP_1 = new TripSpec("2",  1, "BOM JESUS");
    private static final TripSpec TRIP_2 = new TripSpec("43", 0, "ESTACAO");
    private static final long DUTY_DURATION_SECONDS = 20 * 60L;   // 20 min por trip
    private static final long DUTY_GAP_SECONDS      = 15 * 60L;   // 15 min entre trips

    private final BusRepository busRepo;
    private final BusDutyRepository dutyRepo;
    private final TripRepository tripRepo;
    private final DriverBusAssignmentRepository driverAssignmentRepo;
    private final VehicleSensorRepository vehicleSensorRepo;

    public DevController(BusRepository busRepo,
                          BusDutyRepository dutyRepo,
                          TripRepository tripRepo,
                          DriverBusAssignmentRepository driverAssignmentRepo,
                          VehicleSensorRepository vehicleSensorRepo)
    {
        this.busRepo = busRepo;
        this.dutyRepo = dutyRepo;
        this.tripRepo = tripRepo;
        this.driverAssignmentRepo = driverAssignmentRepo;
        this.vehicleSensorRepo = vehicleSensorRepo;
    }

    @GetMapping("/quick-duty/eligible-buses")
    public List<Map<String, Object>> eligibleBuses()
    {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Bus b : busRepo.findAll()) {
            if (!"STOPPED".equalsIgnoreCase(b.getStatus())) continue;
            boolean hasDriver = driverAssignmentRepo.findByBusIdAndActiveTrue(b.getId()).isPresent();
            if (!hasDriver) continue;
            boolean hasSensor = vehicleSensorRepo.existsByBusId(b.getId());
            if (!hasSensor) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", b.getId());
            row.put("busCode", b.getBusCode());
            row.put("licensePlate", b.getLicensePlate());
            row.put("routeId", b.getRoute() != null ? b.getRoute().getId() : null);
            row.put("routeCode", b.getRoute() != null ? b.getRoute().getCode() : null);
            out.add(row);
        }
        return out;
    }

    @PostMapping("/quick-duty")
    @Transactional
    public ResponseEntity<?> quickDuty(@RequestParam Long busId,
                                        @RequestParam(defaultValue = "1") int minutes)
    {
        Bus bus = busRepo.findById(busId).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Bus nao encontrado: " + busId));

        // (1) STOPPED
        if (!"STOPPED".equalsIgnoreCase(bus.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Bus " + bus.getBusCode() + " tem que estar em STOPPED (estado: " + bus.getStatus() + ").");
        }
        // (2) motorista atribuido
        if (!driverAssignmentRepo.findByBusIdAndActiveTrue(bus.getId()).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Bus " + bus.getBusCode() + " nao tem motorista atribuido.");
        }
        // (3) sensor atribuido
        if (!vehicleSensorRepo.existsByBusId(bus.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Bus " + bus.getBusCode() + " nao tem sensor atribuido.");
        }

        LocalDate today = LocalDate.now(LISBON);

        // (4) limpar duties PLANNED anteriores deste bus em today (auto-clean)
        int cleaned = 0;
        for (BusDuty d : dutyRepo.findByBusIdAndServiceDateOrderBySequence(bus.getId(), today)) {
            if ("PLANNED".equalsIgnoreCase(d.getStatus())) {
                dutyRepo.delete(d);
                cleaned++;
            }
        }

        // (5) resolver as 2 trips (alvo) — escala fixa
        Trip t1 = pickTrip(TRIP_1, today);
        Trip t2 = pickTrip(TRIP_2, today);

        if (t1 == null || t2 == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Nao foi possivel resolver a escala teste: trip1=" + (t1 != null) + ", trip2=" + (t2 != null)
                + ". Verifica se as rotas 2 e 43 foram importadas via GTFS.");
        }

        // (6) calcular sequence base (depois das DONE/RUNNING/CANCELLED que ja' existem)
        int baseSeq = dutyRepo.findByBusIdAndServiceDateOrderBySequence(bus.getId(), today).size();

        Instant start1 = Instant.now().plusSeconds(Math.max(1, minutes) * 60L);
        Instant end1   = start1.plusSeconds(DUTY_DURATION_SECONDS);
        Instant start2 = end1.plusSeconds(DUTY_GAP_SECONDS);
        Instant end2   = start2.plusSeconds(DUTY_DURATION_SECONDS);

        BusDuty d1 = saveDuty(bus, t1, today, baseSeq + 1, start1, end1);
        BusDuty d2 = saveDuty(bus, t2, today, baseSeq + 2, start2, end2);

        // Sprint 5 (follow-up): atribui ao bus a rota da 1a trip da escala.
        // Sem isto, bus.route_id fica NULL e o StopPanelService nao consegue
        // matchar a paragem com o bus (filtro findByRouteIdAndStatusIn).
        if (t1.getRoute() != null) {
            bus.setRoute(t1.getRoute());
            busRepo.save(bus);
        }

        log.info("[DEV] quickDuty: bus={} cleaned={} routeAttr={} duty1=(trip {}, {}) duty2=(trip {}, {})",
            bus.getBusCode(), cleaned,
            t1.getRoute() != null ? t1.getRoute().getCode() : "?",
            t1.getId(), start1, t2.getId(), start2);

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
            "busId", busId,
            "busCode", bus.getBusCode(),
            "serviceDate", today.toString(),
            "cleanedPlanned", cleaned,
            "duty1", Map.of("id", d1.getId(), "tripId", t1.getId(), "headsign", t1.getHeadsign(),
                "routeCode", t1.getRoute() != null ? t1.getRoute().getCode() : null,
                "plannedStart", start1.toString(), "plannedEnd", end1.toString(), "sequence", baseSeq + 1),
            "duty2", Map.of("id", d2.getId(), "tripId", t2.getId(), "headsign", t2.getHeadsign(),
                "routeCode", t2.getRoute() != null ? t2.getRoute().getCode() : null,
                "plannedStart", start2.toString(), "plannedEnd", end2.toString(), "sequence", baseSeq + 2)
        ));
    }

    private Trip pickTrip(TripSpec spec, LocalDate today)
    {
        // 1a tentativa: rota + direction + headsign
        List<Trip> matches = tripRepo.findByRouteCodeDirectionAndHeadsignLike(
            spec.routeCode, spec.directionId, spec.headsign);
        for (Trip t : matches) {
            if (!dutyRepo.existsByTripIdAndServiceDate(t.getId(), today)) return t;
        }
        // fallback: 1a trip livre da rota (qualquer direction/headsign)
        for (Trip t : tripRepo.findByRouteCode(spec.routeCode)) {
            if (!dutyRepo.existsByTripIdAndServiceDate(t.getId(), today)) return t;
        }
        return null;
    }

    private BusDuty saveDuty(Bus bus, Trip trip, LocalDate today, int sequence,
                              Instant start, Instant end)
    {
        BusDuty d = new BusDuty();
        d.setBus(bus);
        d.setTrip(trip);
        d.setServiceDate(today);
        d.setSequence(sequence);
        d.setPlannedStart(start);
        d.setPlannedEnd(end);
        d.setStatus("PLANNED");
        return dutyRepo.save(d);
    }

    /** Especificacao usada para encontrar uma trip — by route code + direction + headsign substring. */
    private record TripSpec(String routeCode, int directionId, String headsign) {}
}
