package dai.tub.pgu.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.BusDuty;
import dai.tub.pgu.domain.BusStop;
import dai.tub.pgu.domain.GlobalConfig;
import dai.tub.pgu.domain.JourneyPattern;
import dai.tub.pgu.domain.PatternStop;
import dai.tub.pgu.dto.DriverDepartureDTO;
import dai.tub.pgu.repository.BusDutyRepository;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.GlobalConfigRepository;
import dai.tub.pgu.repository.PatternStopRepository;

/**
 * "Hora X" do motorista: calcula a hora exacta a que tem de sair da central
 * TUB para chegar a tempo a' primeira paragem da primeira trip planeada
 * para HOJE.
 *
 * <p>Formula:
 * <pre>
 *   distancia = OSRM(central, 1a paragem)
 *   velocidade = AVG(speed_kmh) ultimos 7 dias  // fallback 30 km/h
 *   driveTime = distancia / velocidade
 *   horaX = plannedStart(1a duty) - driveTime
 * </pre>
 *
 * <p>O service e' chamado pelo {@code GET /api/v1/drivers/me/departure}.
 */
@Service
public class DriverDepartureService
{
    private static final Logger log = LoggerFactory.getLogger(DriverDepartureService.class);
    private static final ZoneId ZONE_LISBON = ZoneId.of("Europe/Lisbon");
    private static final double FALLBACK_AVG_SPEED_KMH = 30.0;
    // Coordenadas exactas da garagem TUB Braga. Usadas como fallback se a
    // central nao estiver configurada em GlobalConfig (em Parametros >
    // Central TUB no backoffice). Migracao V59 popula estes valores como
    // default para qualquer instalacao com o default antigo (41.5454, -8.4265).
    private static final double FALLBACK_CENTRAL_LAT = 41.539908;
    private static final double FALLBACK_CENTRAL_LON = -8.435542;

    private final DriverService driverService;
    private final BusRepository busRepository;
    private final BusDutyRepository dutyRepository;
    private final PatternStopRepository patternStopRepository;
    private final GlobalConfigRepository globalConfigRepository;
    private final OsrmService osrmService;
    private final JdbcTemplate jdbcTemplate;

    public DriverDepartureService(DriverService driverService,
                                  BusRepository busRepository,
                                  BusDutyRepository dutyRepository,
                                  PatternStopRepository patternStopRepository,
                                  GlobalConfigRepository globalConfigRepository,
                                  OsrmService osrmService,
                                  JdbcTemplate jdbcTemplate)
    {
        this.driverService = driverService;
        this.busRepository = busRepository;
        this.dutyRepository = dutyRepository;
        this.patternStopRepository = patternStopRepository;
        this.globalConfigRepository = globalConfigRepository;
        this.osrmService = osrmService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(readOnly = true)
    public DriverDepartureDTO computeForDriver(String keycloakUsername)
    {
        // 1) Localiza o autocarro do motorista (usa a logica ja' existente).
        String busCode;
        try {
            busCode = driverService.getAssignedBusCode(keycloakUsername);
        } catch (Exception e) {
            return modeNoSchedule();
        }
        Bus bus = busRepository.findByBusCode(busCode).orElse(null);
        if (bus == null) return modeNoSchedule();

        // 2) Procura a 1a duty PLANNED/RUNNING da escala de hoje.
        LocalDate today = LocalDate.now(ZONE_LISBON);
        List<BusDuty> duties = dutyRepository.findByBusIdAndServiceDateOrderBySequence(bus.getId(), today);
        Optional<BusDuty> firstOpt = duties.stream()
                .filter(d -> "PLANNED".equals(d.getStatus()) || "RUNNING".equals(d.getStatus()))
                .findFirst();
        if (firstOpt.isEmpty()) return modeNoSchedule();
        BusDuty first = firstOpt.get();

        // 3) Carrega a primeira paragem do padrao dessa trip.
        JourneyPattern pattern = first.getTrip() != null ? first.getTrip().getPattern() : null;
        if (pattern == null) return modeNoSchedule();
        List<PatternStop> stops = patternStopRepository.findByPatternIdOrderByStopSequence(pattern.getId());
        if (stops.isEmpty()) return modeNoSchedule();
        BusStop firstStop = stops.get(0).getStop();
        if (firstStop == null || firstStop.getLocation() == null) return modeNoSchedule();
        double stopLat = firstStop.getLocation().getY();
        double stopLon = firstStop.getLocation().getX();

        // 4) Central TUB (com fallback se nao configurada).
        Optional<GlobalConfig> cfgOpt = globalConfigRepository.findById(1L);
        Double centralLat = cfgOpt.map(GlobalConfig::getTubCentralLat).orElse(null);
        Double centralLon = cfgOpt.map(GlobalConfig::getTubCentralLon).orElse(null);
        if (centralLat == null || centralLat == 0.0) centralLat = FALLBACK_CENTRAL_LAT;
        if (centralLon == null || centralLon == 0.0) centralLon = FALLBACK_CENTRAL_LON;

        // 5) Distancia real central -> 1a paragem (OSRM container interno).
        double distance = osrmService.getDistance(centralLat, centralLon, stopLat, stopLon);
        if (distance < 0) {
            log.warn("OSRM falhou para central->1a paragem; usar 0m");
            distance = 0;
        }

        // 6) Velocidade media da frota ultimos 7 dias (fallback 30 km/h).
        Double avgSpeed = null;
        try {
            avgSpeed = jdbcTemplate.queryForObject(
                "SELECT AVG(speed_kmh) FROM vehicle_telemetry " +
                "WHERE speed_kmh > 0 AND recorded_at > now() - interval '7 days'",
                Double.class);
        } catch (Exception e) {
            log.warn("Falha a calcular velocidade media: {}", e.getMessage());
        }
        if (avgSpeed == null || avgSpeed <= 0) avgSpeed = FALLBACK_AVG_SPEED_KMH;

        // 7) Drive time e Hora X.
        int driveTimeSeconds = (int) Math.round((distance / 1000.0) / avgSpeed * 3600);
        Instant horaX = first.getPlannedStart().minusSeconds(driveTimeSeconds);
        Instant now = Instant.now();
        String mode = now.isBefore(horaX) ? "BEFORE" : "AFTER";

        DriverDepartureDTO dto = new DriverDepartureDTO();
        dto.setMode(mode);
        dto.setHoraX(horaX);
        dto.setPlannedStart(first.getPlannedStart());
        dto.setFirstStopName(firstStop.getName());
        dto.setFirstStopId(firstStop.getId());
        dto.setDistanceMeters(distance);
        dto.setAvgSpeedKmh(avgSpeed);
        dto.setDriveTimeSeconds(driveTimeSeconds);
        if ("AFTER".equals(mode)) {
            long minutes = (now.getEpochSecond() - horaX.getEpochSecond()) / 60;
            dto.setDelayMinutes(Math.max(0, minutes));
        }
        return dto;
    }

    /**
     * Persiste o instante real do click "Iniciar" e o tipo de partida (EARLY/
     * ON_TIME/LATE) na primeira duty PLANNED da escala de hoje. Chamado pelo
     * {@code POST /api/v1/buses/{id}/start} quando o motorista arranca.
     */
    @Transactional
    public void recordActualDeparture(Long busId, String departureType)
    {
        if (busId == null || departureType == null) return;
        LocalDate today = LocalDate.now(ZONE_LISBON);
        List<BusDuty> duties = dutyRepository.findByBusIdAndServiceDateOrderBySequence(busId, today);
        Optional<BusDuty> first = duties.stream()
                .filter(d -> "PLANNED".equals(d.getStatus()) || "RUNNING".equals(d.getStatus()))
                .findFirst();
        if (first.isEmpty()) return;
        BusDuty d = first.get();
        d.setActualStartAt(Instant.now());
        d.setDepartureType(departureType.toUpperCase());
        dutyRepository.save(d);
    }

    private DriverDepartureDTO modeNoSchedule()
    {
        DriverDepartureDTO dto = new DriverDepartureDTO();
        dto.setMode("NO_SCHEDULE");
        return dto;
    }

    // Ignorado: helper para o resto do projeto, caso precise.
    @SuppressWarnings("unused")
    private static ResponseStatusException notFound(String msg) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, msg);
    }
}
