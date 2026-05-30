package dai.tub.pgu.service;

import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.List;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.GlobalConfig;
import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.dto.BusHealthDTO;
import dai.tub.pgu.mapper.TelemetryMapper;
import dai.tub.pgu.repository.TelemetryRepository;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.GlobalConfigRepository;
import java.time.Duration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

@Service
public class TelemetryService
{
    private final TelemetryRepository telemetryRepository;
    private final BusRepository busRepository;
    private final GeometryFactory geometryFactory;
    private final JdbcTemplate jdbc;
    private final AlertaService alertaService;
    private final SimpMessagingTemplate messagingTemplate; // Sprint -1 (BE-9)

    // Sprint 2 (Vertical 3.4): contagem APC + observabilidade.
    private final GlobalConfigRepository globalConfigRepository;
    private final DataSourceHealthService healthService;
    private final Counter boardedCounter;
    private final Counter alightedCounter;
    // Gauge da ultima percentagem de ocupacao observada (occupancy.percent).
    // Mantido num holder atomico que o Micrometer le' periodicamente.
    private final java.util.concurrent.atomic.AtomicReference<Double> lastOccupancyPct =
            new java.util.concurrent.atomic.AtomicReference<>(0.0);

    /** Sprint 2: nomes das DataSources self-pulse alimentadas por este servico (V47). */
    private static final String DS_TELEMETRY_INGEST = "Telemetry ingest";
    private static final String DS_PASSENGER_SENSORS = "Passenger sensors";

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
                            JdbcTemplate jdbc,
                            AlertaService alertaService,
                            SimpMessagingTemplate messagingTemplate,
                            GlobalConfigRepository globalConfigRepository,
                            DataSourceHealthService healthService,
                            MeterRegistry meterRegistry)
    {
        this.telemetryRepository = telemetryRepository;
        this.busRepository = busRepository;
        this.jdbc = jdbc;
        this.alertaService = alertaService;
        this.messagingTemplate = messagingTemplate;
        this.globalConfigRepository = globalConfigRepository;
        this.healthService = healthService;
        // SRID 4326 é o standard WGS84 (usado pelo GPS e Google Maps)
        this.geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

        // Sprint 2 (Vertical 3.4): metricas Micrometer. Counters de entradas/saidas
        // e gauge da ultima ocupacao observada (em %).
        this.boardedCounter = Counter.builder("passenger.boarded")
                .description("Total de passageiros que entraram (APC)")
                .register(meterRegistry);
        this.alightedCounter = Counter.builder("passenger.alighted")
                .description("Total de passageiros que sairam (APC)")
                .register(meterRegistry);
        meterRegistry.gauge("occupancy.percent", lastOccupancyPct,
                ref -> { Double v = ref.get(); return v == null ? 0.0 : v; });
    }

    /**
     * Sprint -1 (BE-1): @Transactional para garantir atomicidade.
     * Sem isto, um crash entre saves deixa o sistema com estado inconsistente
     * (telemetry guardada mas bus.lastSync nao actualizado, ou vice-versa).
     */
    @Transactional
    public void processAndSaveTelemetry(TelemetryDTO dto)
    {
        Coordinate coordinate = new Coordinate(dto.getLongitude(), dto.getLatitude());
        Point location = geometryFactory.createPoint(coordinate);

        // Sprint 2 (Vertical 3.4, R.ICP.01): contagem APC com fallback.
        // Se o produtor (NiFi/simulador antigo) so' enviar passengerCount,
        // onboard = passengerCount; boarded/alighted ficam null (desconhecidos).
        // Se enviar onboard, mantemos passengerCount = onboard por compatibilidade
        // com todos os dashboards/analytics que leem passenger_count.
        boolean hasApc = dto.getOnboard() != null || dto.getBoarded() != null || dto.getAlighted() != null;
        int onboard = dto.getOnboard() != null ? dto.getOnboard() : dto.getPassengers();

        VehicleTelemetry entity = new VehicleTelemetry();
        entity.setBusId(dto.getBusId());
        entity.setLocation(location);
        entity.setPassengers(onboard);
        entity.setBoarded(dto.getBoarded());
        entity.setAlighted(dto.getAlighted());
        entity.setOnboard(onboard);
        entity.setSpeedKmh(dto.getSpeed());
        entity.setRecordedAt(dto.getTimestamp() != null ? dto.getTimestamp() : Instant.now());
        entity.setStatus(dto.getStatus() != null ? dto.getStatus() : "unknown");
        entity.setNextStop(dto.getNextStop());
        entity.setStopsRemaining(dto.getStopsRemaining());

        telemetryRepository.save(entity);

        // Sprint 2 (Vertical 3.4): metricas Micrometer de entradas/saidas.
        if (dto.getBoarded() != null && dto.getBoarded() > 0)  boardedCounter.increment(dto.getBoarded());
        if (dto.getAlighted() != null && dto.getAlighted() > 0) alightedCounter.increment(dto.getAlighted());

        // Update the bus last sync time. Resolve a capacidade para o gauge de
        // ocupacao e para os alertas de ocupacao (R.ICP.05).
        Integer capacity = busRepository.findByBusCode(dto.getBusId()).map(bus -> {
            bus.setLastSync(Instant.now());
            busRepository.save(bus);
            return bus.getCapacity();
        }).orElse(null);

        if (capacity != null && capacity > 0 && onboard > 0) {
            lastOccupancyPct.set(Math.round(1000.0 * onboard / capacity) / 10.0);
            // Sprint 2 (Vertical 3.4, R.ICP.05): alertas de ocupacao.
            alertaService.avaliarOcupacao(dto, onboard, capacity);
        }

        // Avaliar alertas críticos (ex: AVARIADO)
        alertaService.processarTelemetria(dto);

        // Sprint 2 (Vertical 3.4): pulses de saude. "Telemetry ingest" pulsa
        // sempre que ha telemetria persistida; "Passenger sensors" so' quando a
        // leitura traz dados APC reais. recordPulseByName e' best-effort (engole
        // excecoes e corre em REQUIRES_NEW), nao parte a ingestao.
        healthService.recordPulseByName(DS_TELEMETRY_INGEST, "telemetry ingest");
        if (hasApc) {
            healthService.recordPulseByName(DS_PASSENGER_SENSORS, "apc reading");
        }

        // Sprint -1 (BE-9): broadcast WS dentro do service (era no controller).
        // Mantem-se dentro da @Transactional — se a persistencia falhar nao se publica
        // telemetria inconsistente ao frontend.
        messagingTemplate.convertAndSend("/topic/telemetry", dto);
    }

    /**
     * Sprint 2 (Vertical 3.4, R.ICP.05): verificacao periodica de autocarros
     * activos que deixaram de reportar ocupacao. Para cada autocarro nao parado
     * cujo last_sync e' mais velho que occupancy_no_data_minutes (GlobalConfig,
     * default 10), emite um alerta "sem dados de ocupacao" (com o cooldown do
     * AlertaService a evitar spam). Corre a cada 60s.
     */
    @Scheduled(fixedDelay = 60_000L, initialDelay = 60_000L)
    public void verificarAusenciaDeDados() {
        GlobalConfig config = globalConfigRepository.findAll().stream().findFirst().orElse(null);
        int noDataMinutes = (config != null && config.getOccupancyNoDataMinutes() != null)
                ? config.getOccupancyNoDataMinutes() : 10;
        Instant now = Instant.now();
        for (Bus bus : busRepository.findAll()) {
            if ("STOPPED".equals(bus.getStatus())) continue;
            if (bus.getLastSync() == null) continue;
            long minutos = Duration.between(bus.getLastSync(), now).toMinutes();
            if (minutos >= noDataMinutes) {
                alertaService.alertarSemDadosOcupacao(bus.getBusCode(), minutos);
            }
        }
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

    public List<TelemetryDTO> get24hTelemetry(String busId)
    {
        Instant since = Instant.now().minus(24, java.time.temporal.ChronoUnit.HOURS);
        return telemetryRepository.findByBusIdAndRecordedAtAfterOrderByRecordedAtDesc(busId, since)
            .stream().map(TelemetryMapper::fromEntity).toList();
    }


    public List<BusHealthDTO> getBusHealthStatuses()
    {
        List<Bus> buses = busRepository.findAll();
        Instant now = Instant.now();

        // Autocarros parados não devem aparecer na saúde da rede
        return buses.stream()
            .filter(bus -> !"STOPPED".equals(bus.getStatus()))
            .map(bus -> {
            String status = "No Data";
            if (bus.getLastSync() != null) {
                long minutes = Duration.between(bus.getLastSync(), now).toMinutes();
                if (minutes < 1) {
                    status = "Good Performance";
                } else if (minutes < 60) {
                    status = "Partial Information";
                }
            }
            // lastSync null = acabou de ser reativado, uptime começa do zero
            int uptime = bus.getLastSync() != null
                ? calculateUptimePercentage(bus.getBusCode())
                : 0;
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
