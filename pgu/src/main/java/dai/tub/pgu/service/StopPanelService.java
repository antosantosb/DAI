package dai.tub.pgu.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// import org.slf4j.Logger;
// import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.BusDuty;
import dai.tub.pgu.domain.BusStop;
import dai.tub.pgu.domain.JourneyPattern;
import dai.tub.pgu.domain.PatternStop;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.domain.TripStopTime;
import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.dto.StopEtaDTO;
import dai.tub.pgu.dto.StopPanelDTO;
import dai.tub.pgu.repository.BusDutyRepository;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.BusStopRepository;
import dai.tub.pgu.repository.PatternStopRepository;
import dai.tub.pgu.repository.TelemetryRepository;
import dai.tub.pgu.repository.TripStopTimeRepository;

@Service
public class StopPanelService
{
    // private static final Logger log = LoggerFactory.getLogger(StopPanelService.class);
    private static final double DEFAULT_SPEED_KMH = 25.0;
    private static final double DWELL_TIME_SECONDS = 30.0; // tempo parado por paragem

    private final BusStopRepository stopRepo;
    private final PatternStopRepository patternStopRepo;
    private final BusRepository busRepo;
    private final TelemetryRepository telemetryRepo;
    private final OsrmService osrmService;
    private final BusDutyRepository busDutyRepo;
    private final TripStopTimeRepository tripStopTimeRepo;

    private static final ZoneId LISBON = ZoneId.of("Europe/Lisbon");

    public StopPanelService(BusStopRepository stopRepo, PatternStopRepository patternStopRepo,
                            BusRepository busRepo, TelemetryRepository telemetryRepo,
                            OsrmService osrmService,
                            BusDutyRepository busDutyRepo,
                            TripStopTimeRepository tripStopTimeRepo)
    {
        this.stopRepo = stopRepo;
        this.patternStopRepo = patternStopRepo;
        this.busRepo = busRepo;
        this.telemetryRepo = telemetryRepo;
        this.osrmService = osrmService;
        this.busDutyRepo = busDutyRepo;
        this.tripStopTimeRepo = tripStopTimeRepo;
    }

    public StopPanelDTO getPanel(Long stopId)
    {
        BusStop stop = stopRepo.findById(stopId)
            .orElseThrow(() -> new RuntimeException("Paragem nao encontrada: " + stopId));

        double stopLat = stop.getLocation().getY();
        double stopLon = stop.getLocation().getX();
        int maxDisplay = stop.getMaxBusesDisplay() != null ? stop.getMaxBusesDisplay() : 3;

        // Sprint 5 (follow-up): paragem pode aparecer em MUITOS patterns, com
        // papéis diferentes (partida num, chegada noutro). O "bestPerRoute"
        // escolhia sempre o pattern maior — mas se nesse pattern a paragem
        // é a primeira (partida), qualquer bus em serviço já "passou" e o
        // ETA fica vazio (bug real visto em BOM JESUS, 1a/última conforme pattern).
        //
        // Solução correcta: iterar TODOS os pattern_stops onde a paragem aparece.
        // O matching com o bus é feito pela trip RUNNING dele — só processa
        // se o pattern do hit == pattern da trip RUNNING do bus.
        List<PatternStop> hits = patternStopRepo.findByStopIdFull(stopId);
        Map<Long, Long> patternStopCount = new HashMap<>();
        for (PatternStop ps : hits) {
            patternStopCount.computeIfAbsent(ps.getPattern().getId(), patternStopRepo::countByPatternId);
        }

        List<StopEtaDTO> allEtas = new ArrayList<>();
        java.util.Set<String> seenBusInRoute = new java.util.HashSet<>(); // dedup (busId|routeId)

        for (PatternStop rs : hits)
        {
            Route route = rs.getPattern().getRoute();
            int stopOrder = rs.getStopSequence();
            int totalStops = patternStopCount.getOrDefault(rs.getPattern().getId(), 0L).intValue();
            Long hitPatternId = rs.getPattern().getId();

            // Sprint 5 (follow-up): APENAS EM_SERVICO. STARTING/STOPPING são
            // deadheads central↔1ª/última paragem onde o ETA é especulativo
            // (haversine ou GTFS sem âncora real na rota). Mostrar valores
            // nesses estados confunde mais do que informa. Painel fica vazio
            // ate o bus chegar à primeira paragem da rota.
            List<Bus> activeBuses = busRepo.findByRouteIdAndStatusIn(
                route.getId(), java.util.Set.of("EM_SERVICO"));

            for (Bus bus : activeBuses)
            {
                // Sprint 5 (follow-up): só processa este hit (pattern) se o bus
                // está mesmo numa trip deste pattern. Evita misturar direcção.
                Long busPatternId = null;
                try {
                    LocalDate todayD = LocalDate.now(LISBON);
                    List<BusDuty> rds = busDutyRepo.findRunningByBusAndDate(bus.getId(), todayD);
                    if (!rds.isEmpty() && rds.get(0).getTrip() != null
                        && rds.get(0).getTrip().getPattern() != null) {
                        busPatternId = rds.get(0).getTrip().getPattern().getId();
                    }
                } catch (Exception ignore) {}
                if (busPatternId == null || !busPatternId.equals(hitPatternId)) continue;

                // Dedup: 1 ETA por bus por rota (caso múltiplos hits matchem).
                String dedupKey = bus.getId() + "|" + route.getId();
                if (seenBusInRoute.contains(dedupKey)) continue;
                seenBusInRoute.add(dedupKey);

                VehicleTelemetry latest = telemetryRepo.findLatestByBusId(bus.getBusCode());
                if (latest == null || latest.getLocation() == null) continue;

                // Sprint 5 (follow-up): bus em STARTING ainda nao chegou a 1a
                // paragem, logo nao tem stopsRemaining definido. Tratamos como
                // busCurrentOrder = 0 (vai passar por todas as paragens) para
                // que TODAS as paragens da rota recebam ETA, nao apenas as ja'
                // confirmadas pelo tracking.
                Integer stopsRemaining = latest.getStopsRemaining();
                int busCurrentOrder;
                if (stopsRemaining == null) {
                    busCurrentOrder = 0;
                } else {
                    busCurrentOrder = totalStops - stopsRemaining;
                    if (busCurrentOrder >= stopOrder) continue; // ja passou
                }

                // Sprint 5 (follow-up): ETA = OSRM(bus → próxima paragem da rota)
                // + tempo planeado GTFS entre próxima paragem e paragem alvo.
                // Usar TripStopTime (tempo real planeado) é mais preciso que
                // haversine+velocidade média, e produz ordem coerente com a
                // sequência da rota (paragens no fim têm ETA maior).
                double busLat = latest.getLocation().getY();
                double busLon = latest.getLocation().getX();

                List<PatternStop> patternStops = patternStopRepo
                    .findByPatternIdOrderByStopSequence(rs.getPattern().getId());

                int targetIdx = -1;
                for (int i = 0; i < patternStops.size(); i++) {
                    if (patternStops.get(i).getStopSequence() == stopOrder) { targetIdx = i; break; }
                }
                int nextIdx = Math.max(0, Math.min(busCurrentOrder, patternStops.size() - 1));
                if (targetIdx < 0 || targetIdx < nextIdx) continue;

                // 1) Distancia bus → proxima paragem (OSRM real)
                BusStop nextStop = patternStops.get(nextIdx).getStop();
                if (nextStop == null || nextStop.getLocation() == null) continue;
                double nextLat = nextStop.getLocation().getY();
                double nextLon = nextStop.getLocation().getX();
                double distMeters = osrmService.getDistance(busLat, busLon, nextLat, nextLon);
                if (distMeters < 0) {
                    distMeters = haversineMeters(busLat, busLon, nextLat, nextLon) * 1.4;
                }

                double speedKmh = (latest.getSpeedKmh() != null && latest.getSpeedKmh() > 0)
                    ? latest.getSpeedKmh() : DEFAULT_SPEED_KMH;

                double travelToNextMin = (distMeters / 1000.0) / speedKmh * 60.0;

                // 2) Tempo planeado GTFS entre próxima paragem e paragem alvo.
                //    Usa TripStopTime da trip RUNNING/PLANNED deste bus.
                double tripTravelMin = 0;
                Long tripIdForTime = null;
                try {
                    LocalDate todayD = LocalDate.now(LISBON);
                    List<BusDuty> rds = busDutyRepo.findByBusIdAndServiceDateOrderBySequence(bus.getId(), todayD);
                    for (BusDuty d : rds) {
                        String st = d.getStatus();
                        if ("RUNNING".equalsIgnoreCase(st) || "PLANNED".equalsIgnoreCase(st)) {
                            tripIdForTime = d.getTrip().getId();
                            break;
                        }
                    }
                    if (tripIdForTime != null) {
                        Long nextStopId = nextStop.getId();
                        Long targetStopId = patternStops.get(targetIdx).getStop().getId();
                        List<TripStopTime> nx = tripStopTimeRepo.findByTripIdAndStopId(tripIdForTime, nextStopId);
                        List<TripStopTime> tg = tripStopTimeRepo.findByTripIdAndStopId(tripIdForTime, targetStopId);
                        if (!nx.isEmpty() && !tg.isEmpty()) {
                            long nxSec = parseSecsOfDay(nx.get(0).getArrivalTime());
                            long tgSec = parseSecsOfDay(tg.get(0).getArrivalTime());
                            if (tgSec >= nxSec) tripTravelMin = (tgSec - nxSec) / 60.0;
                        }
                    }
                } catch (Exception ignore) { /* fallback abaixo */ }

                // Fallback: se nao temos trip times, soma haversine + dwell (estimativa).
                if (tripTravelMin <= 0 && targetIdx > nextIdx) {
                    for (int i = nextIdx; i < targetIdx; i++) {
                        BusStop a = patternStops.get(i).getStop();
                        BusStop b = patternStops.get(i + 1).getStop();
                        if (a == null || b == null || a.getLocation() == null || b.getLocation() == null) continue;
                        double hop = haversineMeters(
                            a.getLocation().getY(), a.getLocation().getX(),
                            b.getLocation().getY(), b.getLocation().getX()) * 1.4;
                        tripTravelMin += (hop / 1000.0) / speedKmh * 60.0;
                    }
                    tripTravelMin += (targetIdx - nextIdx) * DWELL_TIME_SECONDS / 60.0;
                }

                int etaMinutes = (int) Math.ceil(travelToNextMin + tripTravelMin);
                if (etaMinutes < 1) etaMinutes = 1;

                // Sprint 5 (follow-up): tentar enriquecer com scheduled + delay.
                // Procura a duty RUNNING deste bus hoje, vai a TripStopTime
                // desta paragem, calcula minutos ate ao scheduled e o atraso.
                String scheduled = null;
                Integer delay = null;
                Long tripId = null;
                try {
                    LocalDate today = LocalDate.now(LISBON);
                    List<BusDuty> running = busDutyRepo.findRunningByBusAndDate(bus.getId(), today);
                    if (!running.isEmpty()) {
                        BusDuty duty = running.get(0);
                        tripId = duty.getTrip().getId();
                        List<TripStopTime> tsts = tripStopTimeRepo.findByTripIdAndStopId(tripId, stopId);
                        if (!tsts.isEmpty()) {
                            String arr = tsts.get(0).getArrivalTime(); // "HH:mm:ss" ou "HH:mm"
                            if (arr != null && !arr.isBlank()) {
                                // Truncar a HH:mm para display
                                scheduled = arr.length() >= 5 ? arr.substring(0, 5) : arr;
                                long scheduledFromNowMin = minutesFromNowToHHmm(arr, today);
                                // Atraso = (chegada real) - (chegada teorica). Positivo = atrasado.
                                delay = (int) (etaMinutes - scheduledFromNowMin);
                            }
                        }
                    }
                } catch (Exception ignore) {
                    // best-effort: se algo falhar, ETA fica sem scheduled
                }

                allEtas.add(new StopEtaDTO(
                    route.getCode(),
                    route.getColor() != null ? route.getColor() : "#6366f1",
                    bus.getBusCode(),
                    etaMinutes,
                    scheduled,
                    delay,
                    tripId
                ));
            }
        }

        // Ordenar por ETA e limitar ao maxDisplay
        allEtas.sort(Comparator.comparingInt(StopEtaDTO::getEtaMinutes));
        List<StopEtaDTO> displayEtas = allEtas.size() > maxDisplay
            ? allEtas.subList(0, maxDisplay) : allEtas;

        StopPanelDTO panel = new StopPanelDTO();
        panel.setStopId(stop.getId());
        panel.setStopName(stop.getName());
        panel.setStopCode(stop.getCode());
        panel.setPanelMessage(stop.getPanelMessage());
        panel.setEtas(displayEtas);

        return panel;
    }

    private double haversineMeters(double lat1, double lon1, double lat2, double lon2)
    {
        double R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * Sprint 5 (follow-up): converte "HH:mm[:ss]" GTFS para segundos do dia.
     * Suporta horas >= 24 (corrida que cruza meia-noite).
     */
    private static long parseSecsOfDay(String hhmmss) {
        if (hhmmss == null || hhmmss.isBlank()) return 0L;
        try {
            String[] p = hhmmss.split(":");
            long h = Long.parseLong(p[0]);
            long m = p.length > 1 ? Long.parseLong(p[1]) : 0;
            long s = p.length > 2 ? Long.parseLong(p[2]) : 0;
            return h * 3600 + m * 60 + s;
        } catch (Exception e) {
            return 0L;
        }
    }

    /**
     * Sprint 5 (follow-up): minutos entre AGORA e um "HH:mm[:ss]" no
     * service date. Suporta horas >= 24 (formato GTFS) -- noite seguinte.
     * Negativo significa que o horario teorico ja passou (ja devia ter chegado).
     */
    private long minutesFromNowToHHmm(String hhmmss, LocalDate serviceDate)
    {
        try {
            String[] parts = hhmmss.split(":");
            int h = Integer.parseInt(parts[0]);
            int m = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            int s = parts.length > 2 ? Integer.parseInt(parts[2]) : 0;

            LocalDate date = serviceDate;
            int hour = h;
            if (h >= 24) { date = date.plusDays(h / 24); hour = h % 24; }

            ZonedDateTime scheduled = ZonedDateTime.of(date, LocalTime.of(hour, m, s), LISBON);
            ZonedDateTime now = ZonedDateTime.now(LISBON);
            return java.time.Duration.between(now, scheduled).toMinutes();
        } catch (Exception e) {
            return 0L;
        }
    }
}
