package dai.tub.pgu.service;

import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.List;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.dto.BusHealthDTO;
import dai.tub.pgu.mapper.TelemetryMapper;
import dai.tub.pgu.repository.TelemetryRepository;
import dai.tub.pgu.repository.BusRepository;
import java.time.Duration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Value;

@Service
public class TelemetryService
{
    private final TelemetryRepository telemetryRepository;
    private final BusRepository busRepository;
    private final GeometryFactory geometryFactory;
    private final JdbcTemplate jdbc;

    /**
     * Intervalo esperado (em segundos) entre publicações de telemetria por autocarro.
     * Define a taxa-alvo contra a qual o uptime é calculado.
     *
     * Valores típicos reais:
     *   - Simulador interno        :  5s
     *   - GPS comercial (celular)  : 10–30s
     *   - MQTT sobre 4G            :  5–30s
     *   - LoRaWAN                  : 60–300s
     *
     * Ao mudar de simulador para IoT real basta ajustar
     *  `pgu.telemetry.expected-interval-sec` em application.properties.
     */
    @Value("${pgu.telemetry.expected-interval-sec:5}")
    private int expectedIntervalSec;

    /** Janela de referência do cálculo de uptime (em horas). */
    @Value("${pgu.telemetry.uptime-window-hours:24}")
    private int uptimeWindowHours;

    public TelemetryService(TelemetryRepository telemetryRepository,
                            BusRepository busRepository,
                            JdbcTemplate jdbc)
    {
        this.telemetryRepository = telemetryRepository;
        this.busRepository = busRepository;
        this.jdbc = jdbc;
        // SRID 4326 é o standard WGS84 (usado pelo GPS e Google Maps)
        this.geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
    }

    public void processAndSaveTelemetry(TelemetryDTO dto)
    {
        Coordinate coordinate = new Coordinate(dto.getLongitude(), dto.getLatitude());
        Point location = geometryFactory.createPoint(coordinate);

        VehicleTelemetry entity = new VehicleTelemetry();
        entity.setBusId(dto.getBusId());
        entity.setLocation(location);
        entity.setPassengers(dto.getPassengers());
        entity.setSpeedKmh(dto.getSpeed());
        entity.setRecordedAt(dto.getTimestamp() != null ? dto.getTimestamp() : Instant.now());
        entity.setStatus(dto.getStatus() != null ? dto.getStatus() : "unknown");
        entity.setNextStop(dto.getNextStop());
        entity.setStopsRemaining(dto.getStopsRemaining());

        telemetryRepository.save(entity);

        // Update the bus last sync time
        busRepository.findByBusCode(dto.getBusId()).ifPresent(bus -> {
            bus.setLastSync(Instant.now());
            busRepository.save(bus);
        });
    }

    public List<TelemetryDTO> getAllTelemetry()
    {
        List<VehicleTelemetry> entities = telemetryRepository.findAll();

        return entities.stream().map(TelemetryMapper::fromEntity).toList();
    }

    public List<TelemetryDTO> getLatestPerBus()
    {
        return telemetryRepository.findLatestPerBus()
            .stream().map(TelemetryMapper::fromEntity).toList();
    }

    public List<BusHealthDTO> getBusHealthStatuses()
    {
        List<Bus> buses = busRepository.findAll();
        Instant now = Instant.now();

        return buses.stream().map(bus -> {
            String status = "No Data";
            if (bus.getLastSync() != null) {
                long minutes = Duration.between(bus.getLastSync(), now).toMinutes();
                if (minutes < 1) {
                    status = "Good Performance";
                } else if (minutes < 60) {
                    status = "Partial Information";
                }
            }
            int uptime = calculateUptimePercentage(bus.getBusCode());
            return new BusHealthDTO(bus.getBusCode(), bus.getLastSync(), status, uptime);
        }).toList();
    }

    /**
     * Uptime real (duty-cycle de publicação) numa janela deslizante de {@code uptimeWindowHours}.
     *
     * Definição: rácio entre amostras efectivamente recebidas e amostras esperadas,
     * considerando o intervalo de publicação nominal {@code expectedIntervalSec}.
     *
     * A janela efectiva começa na primeira amostra observada dentro da janela configurada
     * (evita que um autocarro novo entre em linha com 2% de uptime só porque não existia há 24h).
     *
     * Fórmula:
     *   uptime = min(100, (amostras_recebidas × 100) / amostras_esperadas)
     *   amostras_esperadas = max(1, segundos_janela_efectiva / intervalo_esperado)
     *
     * Agnóstico de fonte — funciona identicamente com simulador, MQTT, LoRaWAN, etc.
     */
    public int calculateUptimePercentage(String busId) {
        String sql = """
            SELECT COUNT(*)                                                AS samples,
                   EXTRACT(EPOCH FROM (NOW() - COALESCE(MIN(recorded_at),
                                                       NOW() - INTERVAL '%d hours'))) AS window_sec
            FROM vehicle_telemetry
            WHERE bus_id = ?
              AND recorded_at >= NOW() - INTERVAL '%d hours'
            """.formatted(uptimeWindowHours, uptimeWindowHours);

        return jdbc.query(sql, rs -> {
            if (!rs.next()) return 0;
            long samples  = rs.getLong("samples");
            double windowSec = rs.getDouble("window_sec");
            if (samples == 0 || windowSec <= 0) return 0;
            long expected = Math.max(1L, (long) (windowSec / expectedIntervalSec));
            long pct = Math.min(100L, (samples * 100L) / expected);
            return (int) pct;
        }, busId);
    }
}
