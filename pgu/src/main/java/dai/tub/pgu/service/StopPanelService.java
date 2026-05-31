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

        // Encontrar as rotas que passam por esta paragem (via padroes).
        // Por rota usamos o padrao representativo (o que tem mais paragens) que
        // contem esta paragem, para obter a ordem da paragem e o total de paragens.
        List<PatternStop> hits = patternStopRepo.findByStopIdFull(stopId);
        Map<Long, PatternStop> bestPerRoute = new HashMap<>();
        Map<Long, Long> patternStopCount = new HashMap<>();
        for (PatternStop ps : hits)
        {
            JourneyPattern jp = ps.getPattern();
            Long routeId = jp.getRoute().getId();
            long total = patternStopCount.computeIfAbsent(jp.getId(), patternStopRepo::countByPatternId);
            PatternStop cur = bestPerRoute.get(routeId);
            long curTotal = cur == null ? -1 : patternStopCount.getOrDefault(cur.getPattern().getId(), 0L);
            if (cur == null || total > curTotal) bestPerRoute.put(routeId, ps);
        }

        List<StopEtaDTO> allEtas = new ArrayList<>();

        for (PatternStop rs : bestPerRoute.values())
        {
            Route route = rs.getPattern().getRoute();
            int stopOrder = rs.getStopSequence();
            int totalStops = patternStopCount.getOrDefault(rs.getPattern().getId(), 0L).intValue();

            // Buscar autocarros em operacao nesta rota (EM_SERVICO + transicoes).
            // Sprint 5 (follow-up): antes filtravamos por "ACTIVE" mas no PGU
            // o Bus.status nunca tem esse valor (e' "EM_SERVICO" / "STARTING"
            // / "STOPPING" / "STOPPED"). Resultado: lista vazia sempre.
            List<Bus> activeBuses = busRepo.findByRouteIdAndStatusIn(
                route.getId(), java.util.Set.of("EM_SERVICO", "STARTING", "STOPPING"));

            for (Bus bus : activeBuses)
            {
                VehicleTelemetry latest = telemetryRepo.findLatestByBusId(bus.getBusCode());
                if (latest == null || latest.getLocation() == null) continue;

                // Verificar se o autocarro ainda nao passou desta paragem
                Integer stopsRemaining = latest.getStopsRemaining();
                if (stopsRemaining == null) continue;

                // Posicao atual do autocarro na rota (indice baseado em 1)
                int busCurrentOrder = totalStops - stopsRemaining;
                if (busCurrentOrder >= stopOrder) continue; // ja passou

                // Calcular ETA via OSRM
                double busLat = latest.getLocation().getY();
                double busLon = latest.getLocation().getX();

                double distMeters = osrmService.getDistance(busLat, busLon, stopLat, stopLon);
                if (distMeters < 0)
                {
                    // Fallback: distancia em linha reta * 1.4
                    distMeters = haversineMeters(busLat, busLon, stopLat, stopLon) * 1.4;
                }

                double speedKmh = (latest.getSpeedKmh() != null && latest.getSpeedKmh() > 0)
                    ? latest.getSpeedKmh() : DEFAULT_SPEED_KMH;

                // Numero de paragens intermedias entre o autocarro e esta paragem
                int intermediateStops = stopOrder - busCurrentOrder - 1;
                if (intermediateStops < 0) intermediateStops = 0;

                // ETA = tempo de viagem + tempo parado nas paragens intermedias
                double travelMinutes = (distMeters / 1000.0) / speedKmh * 60.0;
                double dwellMinutes = intermediateStops * DWELL_TIME_SECONDS / 60.0;
                int etaMinutes = (int) Math.ceil(travelMinutes + dwellMinutes);
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
