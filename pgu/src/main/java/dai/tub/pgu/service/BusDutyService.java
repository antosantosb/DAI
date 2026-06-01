package dai.tub.pgu.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.BusDuty;
import dai.tub.pgu.domain.Trip;
import dai.tub.pgu.domain.TripStopTime;
import dai.tub.pgu.dto.BusDutyDTO;
import dai.tub.pgu.repository.BusDutyRepository;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.TripRepository;
import dai.tub.pgu.repository.TripStopTimeRepository;

@Service
public class BusDutyService
{
    private static final String BUS_STATUS_STOPPED = "STOPPED";
    private static final ZoneId ZONE_LISBON = ZoneId.of("Europe/Lisbon");

    private final BusDutyRepository dutyRepository;
    private final BusRepository busRepository;
    private final TripRepository tripRepository;
    private final TripStopTimeRepository tripStopTimeRepository;

    public BusDutyService(BusDutyRepository dutyRepository,
                          BusRepository busRepository,
                          TripRepository tripRepository,
                          TripStopTimeRepository tripStopTimeRepository)
    {
        this.dutyRepository = dutyRepository;
        this.busRepository = busRepository;
        this.tripRepository = tripRepository;
        this.tripStopTimeRepository = tripStopTimeRepository;
    }

    // ============================================================
    // Comandos
    // ============================================================

    @Transactional
    public List<BusDutyDTO> createDuty(Long busId, Long patternId, LocalDate serviceDate, List<Long> tripIds)
    {
        if (busId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "busId obrigatorio.");
        }

        if (serviceDate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "serviceDate obrigatorio.");
        }
        if (tripIds == null || tripIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "tripIds nao pode estar vazio.");
        }

        // Bus existe e esta STOPPED.
        Bus bus = busRepository.findById(busId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Autocarro nao encontrado: " + busId));

        if (!BUS_STATUS_STOPPED.equalsIgnoreCase(bus.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "So e' possivel criar/editar a escala com o autocarro em STOPPED. Estado actual: " + bus.getStatus());
        }

        // Carrega todas as trips de uma vez (preserva a ordem de tripIds).
        List<Trip> trips = tripRepository.findAllById(tripIds);
        if (trips.size() != tripIds.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Pelo menos uma das trips nao existe.");
        }

        // Se patternId vier, todas as trips devem pertencer-lhe (legado).
        // Sem patternId, aceita qualquer mistura (escalas multi-padrao).
        if (patternId != null) {
            for (Trip t : trips) {
                Long tripPatternId = t.getPattern() != null ? t.getPattern().getId() : null;
                if (tripPatternId == null || !tripPatternId.equals(patternId)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Trip " + t.getId() + " nao pertence ao padrao " + patternId + ".");
                }
            }
        }

        // Calcula planned_start de cada trip a partir do primeiro TripStopTime.
        Map<Long, Instant> plannedStartByTrip = new HashMap<>();
        for (Trip t : trips) {
            Instant start = computePlannedStart(t.getId(), serviceDate);
            plannedStartByTrip.put(t.getId(), start);
        }

        // Filtro "inicio > agora" para o caso de serviceDate == hoje.
        LocalDate today = LocalDate.now(ZONE_LISBON);
        Instant now = Instant.now();
        List<Trip> filteredTrips = new ArrayList<>();
        if (serviceDate.equals(today)) {
            for (Trip t : trips) {
                Instant ps = plannedStartByTrip.get(t.getId());
                if (ps != null && ps.isAfter(now)) {
                    filteredTrips.add(t);
                }
            }
            if (filteredTrips.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Todas as trips indicadas tem inicio anterior ou igual a agora. Escolhe trips futuras.");
            }
        } else if (serviceDate.isBefore(today)) {
            // Datas passadas nao sao planeaveis.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Nao e' possivel planear escala para datas passadas.");
        } else {
            filteredTrips.addAll(trips);
        }

        // 4) A trip nao pode estar ACTIVAMENTE atribuida a OUTRO bus no mesmo dia. 
        for (Trip t : filteredTrips) {
            if (dutyRepository.isTripActivelyAssignedToOtherBus(t.getId(), serviceDate, busId)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "A trip " + t.getId() + " ja' esta atribuida a outro autocarro em " + serviceDate + ".");
            }
        }

        ZoneId LISBON = ZoneId.of("Europe/Lisbon");
        for (Trip t : filteredTrips) {
            Instant ps = plannedStartByTrip.get(t.getId());
            if (ps == null) continue;
            LocalDate startDay = ps.atZone(LISBON).toLocalDate();
            if (!startDay.equals(serviceDate)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "A trip " + t.getId() + " arranca em " + startDay +
                        " mas a escala e' do dia " + serviceDate +
                        ". Cada trip deve comecar no dia da escala.");
            }
        }

        // Ordena por planned_start e grava com sequence 1..N.
        filteredTrips.sort(Comparator.comparing(t -> plannedStartByTrip.get(t.getId())));

        Instant nowTs = Instant.now();
        List<BusDuty> created = new ArrayList<>();
        // Replanear apos uma escala terminada (duties DONE) deixa as sequence
        // 1..N ocupadas — comecar em MAX+1 para nao violar o UNIQUE
        // (bus_id, service_date, sequence). Em dia novo, MAX=0 -> seq comeca em 1.
        int seq = dutyRepository.maxSequenceForBusAndDate(busId, serviceDate) + 1;
        for (Trip t : filteredTrips) {
            BusDuty duty = new BusDuty();
            duty.setBus(bus);
            duty.setTrip(t);
            duty.setServiceDate(serviceDate);
            duty.setSequence(seq++);
            duty.setPlannedStart(plannedStartByTrip.get(t.getId()));
            duty.setPlannedEnd(computePlannedEnd(t.getId(), serviceDate));
            duty.setStatus("PLANNED");
            duty.setCreatedAt(nowTs);
            duty.setUpdatedAt(nowTs);
            created.add(dutyRepository.save(duty));
        }

        return created.stream().map(this::toDTO).toList();
    }

    @Transactional
    public Long completeTripIfArrived(Long busId, Long tripId)
    {
        if (busId == null || tripId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "busId e tripId sao obrigatorios.");
        }
        LocalDate today = LocalDate.now(ZONE_LISBON);
        List<BusDuty> running = dutyRepository.findRunningByBusAndDate(busId, today);
        if (running.isEmpty()) {
            return null; // idempotente: nao ha RUNNING, talvez ja' DONE.
        }
        BusDuty current = running.get(0);
        Trip currentTrip = current.getTrip();
        if (currentTrip == null || !tripId.equals(currentTrip.getId())) {
            // A RUNNING actual nao corresponde a tripId que o simulador
            // anuncia. Recusamos para nao avancar a escala por engano.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Trip " + tripId + " nao e' a duty RUNNING actual do autocarro " + busId + ".");
        }

        Instant nowTs = Instant.now();
        current.setStatus("DONE");
        current.setUpdatedAt(nowTs);
        dutyRepository.save(current);

        // Promove a proxima PLANNED a RUNNING (se houver).
        List<BusDuty> planned = dutyRepository.findPlannedByBusAndDateOrderBySequence(busId, today);
        if (planned.isEmpty()) {
            return null;
        }
        BusDuty next = planned.get(0);
        next.setStatus("RUNNING");
        next.setUpdatedAt(nowTs);
        dutyRepository.save(next);
        // Sincronizar bus.route com a route da nova duty RUNNING. Com a V72
        // aplicada, trip.route_id == trip.pattern.route_id (invariante), por
        // isso isto fica consistente com o pattern que o bus vai executar.
        // Sem este sync, bus.route ficava no valor antigo (da duty anterior)
        // e a UI mostrava linha errada durante a execucao da nova trip.
        if (next.getTrip() != null && next.getTrip().getRoute() != null) {
            BusDuty refreshed = next;
            refreshed.getBus().setRoute(refreshed.getTrip().getRoute());
        }
        return next.getTrip() != null ? next.getTrip().getId() : null;
    }

    /** Apaga a escala completa de um bus num dia. So' permitido com bus STOPPED. */
    @Transactional
    public void deleteDuty(Long busId, LocalDate serviceDate)
    {
        if (busId == null || serviceDate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "busId e date sao obrigatorios.");
        }
        Bus bus = busRepository.findById(busId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Autocarro nao encontrado: " + busId));
        if (!BUS_STATUS_STOPPED.equalsIgnoreCase(bus.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "So e' possivel apagar a escala com o autocarro em STOPPED. Estado actual: " + bus.getStatus());
        }
        
        dutyRepository.deletePlannedByBusIdAndServiceDate(busId, serviceDate);
    }

    // ============================================================
    // Leituras
    // ============================================================

    @Transactional(readOnly = true)
    public List<BusDutyDTO> listForBusOnDate(Long busId, LocalDate serviceDate)
    {
        if (busId == null || serviceDate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "busId e date sao obrigatorios.");
        }
        return dutyRepository.findByBusIdAndServiceDateOrderBySequence(busId, serviceDate)
                .stream().map(this::toDTO).toList();
    }

    @Transactional(readOnly = true)
    public List<BusDutyDTO> listForDate(LocalDate serviceDate)
    {
        if (serviceDate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "date obrigatorio.");
        }
        return dutyRepository.findByServiceDateFull(serviceDate)
                .stream().map(this::toDTO).toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getCalendarSummary(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "from e to obrigatorios.");
        }
        List<Object[]> rows = dutyRepository.summaryByDayAndBus(from, to);
        // Agrega por dia: { totalTrips, busCount, routeCodes (busCodes legados) }.
        LinkedHashMap<LocalDate, long[]> totals = new LinkedHashMap<>();        // [trips, buses]
        LinkedHashMap<LocalDate, List<String>> codesByDay = new LinkedHashMap<>();
        for (Object[] r : rows) {
            LocalDate date = (LocalDate) r[0];
            String busCode = (String) r[1];
            long trips = ((Number) r[2]).longValue();
            long[] agg = totals.computeIfAbsent(date, d -> new long[]{0, 0});
            agg[0] += trips;
            agg[1] += 1;
            codesByDay.computeIfAbsent(date, d -> new java.util.ArrayList<>()).add(busCode);
        }
        List<Map<String, Object>> days = new java.util.ArrayList<>();
        for (var e : totals.entrySet()) {
            Map<String, Object> day = new LinkedHashMap<>();
            day.put("date", e.getKey().toString());
            day.put("totalTrips", e.getValue()[0]);
            day.put("routeCount", e.getValue()[1]); // nome legado: agora = busCount
            day.put("routeCodes", codesByDay.getOrDefault(e.getKey(), List.of())); // legado: busCodes
            days.add(day);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("hasData", !days.isEmpty());
        out.put("days", days);
        return out;
    }

    // ============================================================
    // Helpers
    // ============================================================

    private Instant computePlannedStart(Long tripId, LocalDate serviceDate)
    {
        List<TripStopTime> stopTimes = tripStopTimeRepository.findByTripIdOrderByStopSequence(tripId);
        if (stopTimes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Trip " + tripId + " nao tem passing-times configurados.");
        }
        String dep = stopTimes.get(0).getDepartureTime();
        LocalTime localTime = parseGtfsTime(dep);
        return serviceDate.atTime(localTime).atZone(ZONE_LISBON).toInstant();
    }

    /**
     * Calcula o planned_end (hora de chegada) como o arrival_time da ULTIMA
     * paragem (stop_sequence mais alto). Null-safe: se nao houver, devolve null.
     */
    private Instant computePlannedEnd(Long tripId, LocalDate serviceDate)
    {
        List<TripStopTime> stopTimes = tripStopTimeRepository.findByTripIdOrderByStopSequence(tripId);
        if (stopTimes.isEmpty()) return null;
        String arr = stopTimes.get(stopTimes.size() - 1).getArrivalTime();
        if (arr == null || arr.isBlank()) {
            // Fallback: usa o departure_time da ultima paragem.
            arr = stopTimes.get(stopTimes.size() - 1).getDepartureTime();
        }
        if (arr == null || arr.isBlank()) return null;
        try {
            LocalTime localTime = parseGtfsTime(arr);
            return serviceDate.atTime(localTime).atZone(ZONE_LISBON).toInstant();
        } catch (Exception e) {
            return null;
        }
    }

    private LocalTime parseGtfsTime(String text)
    {
        if (text == null || text.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "departure_time invalido (vazio).");
        }
        String[] parts = text.trim().split(":");
        try {
            int h = Integer.parseInt(parts[0]) % 24;
            int m = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            int s = parts.length > 2 ? Integer.parseInt(parts[2]) : 0;
            return LocalTime.of(h, m, s);
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "departure_time invalido: " + text);
        }
    }

    private BusDutyDTO toDTO(BusDuty duty)
    {
        BusDutyDTO dto = new BusDutyDTO();
        dto.setId(duty.getId());

        if (duty.getBus() != null) {
            dto.setBusId(duty.getBus().getId());
            dto.setBusCode(duty.getBus().getBusCode());
        }

        Trip trip = duty.getTrip();
        if (trip != null) {
            dto.setTripId(trip.getId());
            dto.setTripHeadsign(trip.getHeadsign());
            // displayName: usar headsign se existir, senao gtfsTripId, senao "trip #id"
            String displayName = trip.getHeadsign();
            if (displayName == null || displayName.isBlank()) {
                displayName = trip.getGtfsTripId() != null ? trip.getGtfsTripId() : "trip #" + trip.getId();
            }
            dto.setTripDisplayName(displayName);
            if (trip.getRoute() != null) {
                dto.setRouteShortName(trip.getRoute().getCode());
                dto.setRouteName(trip.getRoute().getName());
            }
            if (trip.getPattern() != null) {
                dto.setPatternId(trip.getPattern().getId());
            }
        }

        dto.setServiceDate(duty.getServiceDate());
        dto.setSequence(duty.getSequence());
        dto.setPlannedStart(duty.getPlannedStart());
        dto.setPlannedEnd(duty.getPlannedEnd());
        dto.setStatus(duty.getStatus());
        return dto;
    }

    // Helper utilitario: se um cliente quiser agrupar duties por bus (vista
    // de calendario por bus), pode usar esta funcao sem ter de definir um
    // novo DTO. O controller `/api/v1/duties` devolve a lista lisa; o
    // frontend agrupa.
    public static Map<Long, List<BusDutyDTO>> groupByBus(List<BusDutyDTO> rows)
    {
        Map<Long, List<BusDutyDTO>> out = new LinkedHashMap<>();
        for (BusDutyDTO d : rows) {
            out.computeIfAbsent(d.getBusId(), k -> new ArrayList<>()).add(d);
        }
        return out;
    }
}
