package dai.tub.pgu.controller;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import dai.tub.pgu.domain.JourneyPattern;
import dai.tub.pgu.domain.PatternStop;
import dai.tub.pgu.domain.Trip;
import dai.tub.pgu.domain.TripStopTime;
import dai.tub.pgu.repository.JourneyPatternRepository;
import dai.tub.pgu.repository.PatternStopRepository;
import dai.tub.pgu.repository.TripRepository;
import dai.tub.pgu.repository.TripStopTimeRepository;
import dai.tub.pgu.service.ScheduleService;

/**
 * Sprint 1 (F4): horários planeados (R.IVT.05).
 * Sprint 5 (follow-up): permite CRIAR trips num pattern (POST /trips).
 */
@RestController
@RequestMapping("/api/v1/schedules")
public class ScheduleController
{
    private final ScheduleService scheduleService;
    private final JourneyPatternRepository patternRepo;
    private final PatternStopRepository patternStopRepo;
    private final TripRepository tripRepo;
    private final TripStopTimeRepository tripStopTimeRepo;

    public ScheduleController(ScheduleService scheduleService,
                              JourneyPatternRepository patternRepo,
                              PatternStopRepository patternStopRepo,
                              TripRepository tripRepo,
                              TripStopTimeRepository tripStopTimeRepo)
    {
        this.scheduleService = scheduleService;
        this.patternRepo = patternRepo;
        this.patternStopRepo = patternStopRepo;
        this.tripRepo = tripRepo;
        this.tripStopTimeRepo = tripStopTimeRepo;
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

    /**
     * Sprint 5 (follow-up): cria uma trip num pattern com horários paragem-a-paragem.
     *
     * <p>Body:
     * <pre>{
     *   "patternId": 8,
     *   "headsign":  "BOM JESUS via PADIM",
     *   "serviceId": "WEEKDAY",                   // opcional, default "WEEKDAY"
     *   "stopTimes": [                             // opcional. Se omitido, usa-se um
     *                                              // headway uniforme baseado em "startTime" + "intervalMinutes"
     *     { "stopSequence": 1, "arrivalTime": "08:00", "departureTime": "08:00" },
     *     { "stopSequence": 2, "arrivalTime": "08:02", "departureTime": "08:02" },
     *     ...
     *   ],
     *   "startTime":       "08:00",               // alternativa: gera tempos a partir de start + intervalMinutes
     *   "intervalMinutes": 2                       // (default 2 min entre paragens consecutivas)
     * }</pre>
     */
    @PostMapping("/trips")
    @PreAuthorize("hasAnyRole('admin', 'developer', 'funcionario')")
    @Transactional
    public ResponseEntity<Map<String, Object>> createTrip(@RequestBody Map<String, Object> body)
    {
        if (body == null || body.get("patternId") == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "patternId obrigatorio.");
        }
        Long patternId = Long.valueOf(body.get("patternId").toString());
        String headsign = (String) body.getOrDefault("headsign", "");
        String serviceId = (String) body.getOrDefault("serviceId", "WEEKDAY");

        JourneyPattern pattern = patternRepo.findById(patternId).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Pattern nao encontrado: " + patternId));

        List<PatternStop> patternStops = patternStopRepo
            .findByPatternIdOrderByStopSequence(patternId);
        if (patternStops.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Pattern " + patternId + " nao tem paragens. Cria primeiro o trajeto.");
        }

        // 1) Trip
        Trip trip = new Trip();
        trip.setPattern(pattern);
        trip.setRoute(pattern.getRoute());
        trip.setHeadsign(headsign);
        trip.setServiceId(serviceId);
        // gtfsTripId único — usar timestamp para garantir não-colisão entre criações manuais
        trip.setGtfsTripId("MANUAL-" + System.nanoTime());
        trip.setCreatedAt(Instant.now());
        trip = tripRepo.save(trip);

        // 2) TripStopTimes — explícitos ou derivados de start+interval
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> stopTimesIn = (List<Map<String, Object>>) body.get("stopTimes");
        List<TripStopTime> tsts = new ArrayList<>();

        if (stopTimesIn != null && !stopTimesIn.isEmpty()) {
            for (Map<String, Object> st : stopTimesIn) {
                int seq = Integer.parseInt(st.get("stopSequence").toString());
                String arr = (String) st.get("arrivalTime");
                String dep = (String) st.getOrDefault("departureTime", arr);
                PatternStop ps = patternStops.stream()
                    .filter(p -> p.getStopSequence() == seq).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "stopSequence " + seq + " nao existe no pattern."));
                TripStopTime tst = new TripStopTime();
                tst.setTrip(trip);
                tst.setStop(ps.getStop());
                tst.setStopSequence(seq);
                tst.setArrivalTime(arr);
                tst.setDepartureTime(dep);
                tsts.add(tst);
            }
        } else {
            // Derivação a partir de startTime + intervalMinutes (default 2 min/hop)
            String start = (String) body.get("startTime");
            if (start == null || start.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Falta stopTimes OU startTime/intervalMinutes.");
            }
            int interval = body.get("intervalMinutes") == null ? 2
                : Integer.parseInt(body.get("intervalMinutes").toString());
            int baseSecs = parseHHMM(start);
            for (PatternStop ps : patternStops) {
                int secs = baseSecs + (ps.getStopSequence() - 1) * interval * 60;
                String t = formatHHMM(secs);
                TripStopTime tst = new TripStopTime();
                tst.setTrip(trip);
                tst.setStop(ps.getStop());
                tst.setStopSequence(ps.getStopSequence());
                tst.setArrivalTime(t);
                tst.setDepartureTime(t);
                tsts.add(tst);
            }
        }
        tripStopTimeRepo.saveAll(tsts);

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
            "tripId", trip.getId(),
            "patternId", patternId,
            "headsign", headsign,
            "stopTimes", tsts.size()
        ));
    }

    /**
     * Sprint 5 (follow-up): edita uma trip (headsign, serviceId, stop_times).
     * Não permite mudar pattern/route (preserva consistência da estrutura).
     * Replaces todos os stop_times (apaga + recria).
     */
    @PutMapping("/trips/{tripId}")
    @PreAuthorize("hasAnyRole('admin', 'developer', 'funcionario')")
    @Transactional
    public ResponseEntity<Map<String, Object>> updateTrip(@PathVariable Long tripId,
                                                           @RequestBody Map<String, Object> body)
    {
        Trip trip = tripRepo.findById(tripId).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Trip nao encontrada: " + tripId));

        // Atualiza apenas campos editáveis
        if (body.get("headsign") != null) trip.setHeadsign(body.get("headsign").toString());
        if (body.get("serviceId") != null) trip.setServiceId(body.get("serviceId").toString());
        tripRepo.save(trip);

        // stop_times — apaga e recria (mais simples que diff)
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> stopTimesIn = (List<Map<String, Object>>) body.get("stopTimes");
        if (stopTimesIn != null && !stopTimesIn.isEmpty()) {
            List<PatternStop> patternStops = patternStopRepo
                .findByPatternIdOrderByStopSequence(trip.getPattern().getId());

            // Apaga existentes
            List<TripStopTime> existing = tripStopTimeRepo.findByTripIdOrderByStopSequence(tripId);
            if (!existing.isEmpty()) tripStopTimeRepo.deleteAll(existing);
            tripStopTimeRepo.flush();

            // Recria
            List<TripStopTime> newTsts = new ArrayList<>();
            for (Map<String, Object> st : stopTimesIn) {
                int seq = Integer.parseInt(st.get("stopSequence").toString());
                String arr = (String) st.get("arrivalTime");
                String dep = (String) st.getOrDefault("departureTime", arr);
                PatternStop ps = patternStops.stream()
                    .filter(p -> p.getStopSequence() == seq).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "stopSequence " + seq + " nao existe no pattern."));
                TripStopTime tst = new TripStopTime();
                tst.setTrip(trip);
                tst.setStop(ps.getStop());
                tst.setStopSequence(seq);
                tst.setArrivalTime(arr);
                tst.setDepartureTime(dep);
                newTsts.add(tst);
            }
            tripStopTimeRepo.saveAll(newTsts);
        }

        return ResponseEntity.ok(Map.of(
            "tripId", tripId,
            "headsign", trip.getHeadsign(),
            "stopTimes", stopTimesIn != null ? stopTimesIn.size() : 0
        ));
    }

    /**
     * Sprint 5 (follow-up): apaga uma trip e os seus stop_times. Bloqueado
     * se houver bus_duty a referenciar (a duty teria de ser eliminada primeiro).
     */
    @DeleteMapping("/trips/{tripId}")
    @PreAuthorize("hasAnyRole('admin', 'developer', 'funcionario')")
    @Transactional
    public ResponseEntity<Void> deleteTrip(@PathVariable Long tripId)
    {
        if (!tripRepo.existsById(tripId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Trip nao encontrada.");
        }
        try {
            // Apaga os passing times primeiro (FK)
            List<TripStopTime> tsts = tripStopTimeRepo.findByTripIdOrderByStopSequence(tripId);
            if (!tsts.isEmpty()) tripStopTimeRepo.deleteAll(tsts);
            tripRepo.deleteById(tripId);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Nao foi possivel apagar a trip: " + e.getMessage()
                + ". Verifica se ha bus_duty a referenciar.");
        }
    }

    private static int parseHHMM(String hhmm) {
        String[] p = hhmm.split(":");
        return Integer.parseInt(p[0]) * 3600
             + (p.length > 1 ? Integer.parseInt(p[1]) * 60 : 0)
             + (p.length > 2 ? Integer.parseInt(p[2]) : 0);
    }
    private static String formatHHMM(int totalSecs) {
        int h = totalSecs / 3600, m = (totalSecs % 3600) / 60;
        return String.format("%02d:%02d", h, m);
    }
}
