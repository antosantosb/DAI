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
import dai.tub.pgu.repository.VehicleSensorRepository;
import dai.tub.pgu.repository.BusDutyRepository;
import dai.tub.pgu.repository.PatternStopRepository;
import dai.tub.pgu.repository.GlobalConfigRepository;
import dai.tub.pgu.domain.BusDuty;
import dai.tub.pgu.domain.PatternStop;
import dai.tub.pgu.domain.BusStop;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.Duration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

@Service
public class TelemetryService
{
    private static final ZoneId ZONE_LISBON = ZoneId.of("Europe/Lisbon");

    private final TelemetryRepository telemetryRepository;
    private final BusRepository busRepository;
    private final VehicleSensorRepository vehicleSensorRepository;
    private final BusDutyRepository busDutyRepository;
    private final PatternStopRepository patternStopRepository;
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

    /** Sprint 2: nomes das DataSources self-pulse alimentadas por este servico (V47, renomeado na V52).
     *  Public para o SensorIngestService tambem o pulsar no caminho /ingest/sensor. */
    public static final String DS_TELEMETRY_INGEST = "Telemetry ingest";
    // Fase C: o antigo "Passenger sensors" passou a "Main sensors" (gateway de
    // telematica a bordo). O nome e' a chave de lookup do pulse (V52 fez o
    // UPDATE in-place na data_source; tem de bater certo com este valor).
    public static final String DS_MAIN_SENSORS = "Main sensors";

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
                            VehicleSensorRepository vehicleSensorRepository,
                            BusDutyRepository busDutyRepository,
                            PatternStopRepository patternStopRepository,
                            JdbcTemplate jdbc,
                            AlertaService alertaService,
                            SimpMessagingTemplate messagingTemplate,
                            GlobalConfigRepository globalConfigRepository,
                            DataSourceHealthService healthService,
                            MeterRegistry meterRegistry)
    {
        this.telemetryRepository = telemetryRepository;
        this.busRepository = busRepository;
        this.vehicleSensorRepository = vehicleSensorRepository;
        this.busDutyRepository = busDutyRepository;
        this.patternStopRepository = patternStopRepository;
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
        // Defesa: lat/lon obrigatorios. Se vierem null (Jolt incompleto,
        // payload truncado), descarta o frame com log claro em vez de
        // gerar NPE em new Coordinate(null, null).
        if (dto == null || dto.getLatitude() == null || dto.getLongitude() == null) {
            org.slf4j.LoggerFactory.getLogger(TelemetryService.class)
                .warn("[INGEST/LEGACY] frame descartado: lat/lon ausentes (busId={}, lat={}, lon={})",
                    dto == null ? null : dto.getBusId(),
                    dto == null ? null : dto.getLatitude(),
                    dto == null ? null : dto.getLongitude());
            return;
        }
        // Enricher: o sensor envia apenas posicao GPS; a "proxima paragem" e
        // "paragens restantes" sao derivadas no backend a partir da posicao
        // cruzada com a duty RUNNING (pattern stops). Faz-se aqui, antes da
        // persistencia e do broadcast STOMP, para que o frontend receba o
        // valor calculado no mesmo frame de telemetria.
        if (dto.getNextStop() == null || dto.getStopsRemaining() == null) {
            NextStopInfo info = deriveNextStop(dto.getBusId(), dto.getLatitude(), dto.getLongitude());
            if (info != null) {
                if (dto.getNextStop() == null)         dto.setNextStop(info.nextStopName);
                if (dto.getStopsRemaining() == null)   dto.setStopsRemaining(info.stopsRemaining);
            }
        }

        // Enricher: deriva `status` a partir da velocidade. O sensor envia
        // so' speed; ate' ~2 km/h consideramos parado (em paragem ou semaforo)
        // e o livemap mostra o ícone azul "Em Paragem" (at-stop). Acima
        // continua "Em Viagem". So' overrida se o produtor nao enviou status.
        if (dto.getStatus() == null || dto.getStatus().isBlank() || "unknown".equalsIgnoreCase(dto.getStatus())) {
            Double sp = dto.getSpeed();
            if (sp != null && sp < 2.0) {
                dto.setStatus("stopped");
            } else if (sp != null) {
                dto.setStatus("active");
            }
        }

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
        // sempre que ha telemetria persistida; "Main sensors" so' quando a
        // leitura traz dados APC reais. recordPulseByName e' best-effort (engole
        // excecoes e corre em REQUIRES_NEW), nao parte a ingestao.
        healthService.recordPulseByName(DS_TELEMETRY_INGEST, "telemetry ingest");
        if (hasApc) {
            healthService.recordPulseByName(DS_MAIN_SENSORS, "apc reading");
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


    /** Resultado do enricher: nome da proxima paragem + nº de paragens restantes
     *  (inclusive). null se nao houver duty RUNNING ou pattern stops disponiveis. */
    private record NextStopInfo(String nextStopName, Integer stopsRemaining) {}

    /** Cache de progresso por bus: (tripId actual, closestStopIdx ja' visto).
     *  Garante monotonicidade — o "closest" so' avanca enquanto a trip e' a mesma.
     *  Sem isto, quando o bus se aproxima da paragem N+1 e fica mais perto dela
     *  que de N, o closest saltava para N+1 e nextIdx=N+2 (uma paragem a' frente
     *  do correcto). Quando a trip muda, reset. */
    private final java.util.concurrent.ConcurrentHashMap<String, long[]> progressByBus =
        new java.util.concurrent.ConcurrentHashMap<>();

    /**
     * Deriva a proxima paragem da trip a partir da posicao GPS actual.
     *
     * <p>Algoritmo (versao 1, aproximacao):
     * <ol>
     *   <li>Resolve o {@link BusDuty} com status RUNNING para o bus de hoje.</li>
     *   <li>Carrega os {@link PatternStop} ordenados por {@code stopSequence}.</li>
     *   <li>Encontra a stop mais proxima (haversine) a' posicao actual.</li>
     *   <li>Devolve a stop seguinte na sequencia (ou a propria, se for a ultima).</li>
     * </ol>
     *
     * <p>Limitacao conhecida: nao distingue se o bus ja' passou pela stop mais
     * proxima (poderia estar a chegar ou a sair). Para a versao 1 e' suficiente
     * — a stop seguinte na sequencia e' uma aproximacao razoavel da "proxima
     * paragem". Versao 2 podera usar um cache por bus do "current_stop_idx"
     * (so' avanca, nunca recua) para evitar oscilacoes em curvas apertadas.
     */
    private NextStopInfo deriveNextStop(String busCode, Double lat, Double lon) {
        if (busCode == null || lat == null || lon == null) return null;
        var busOpt = busRepository.findByBusCode(busCode);
        if (busOpt.isEmpty()) return null;
        Long busId = busOpt.get().getId();
        LocalDate today = LocalDate.now(ZONE_LISBON);
        List<BusDuty> running = busDutyRepository.findByBusIdAndServiceDateAndStatus(busId, today, "RUNNING");
        if (running.isEmpty()) return null;
        BusDuty duty = running.get(0);
        if (duty.getTrip() == null || duty.getTrip().getPattern() == null) return null;
        Long patternId = duty.getTrip().getPattern().getId();
        List<PatternStop> stops = patternStopRepository.findByPatternIdOrderByStopSequence(patternId);
        if (stops.isEmpty()) return null;

        // Encontra a paragem por que o bus EFECTIVAMENTE PASSOU (i.e., chegou
        // a esta'ar dentro de 30m). Isto e' diferente de "mais proxima":
        // quando o bus passa o ponto medio entre N e N+1, o "mais proxima"
        // salta para N+1 — mas o bus ainda nao chegou la'. Logo a "proxima
        // paragem" tem de ser N+1, nao N+2. Resolve-se trackando a ULTIMA
        // paragem visitada (passou perto), e devolvendo a seguinte.
        final double VISIT_RADIUS_KM = 0.030;  // 30 metros
        int lastVisitedIdx = -1;
        for (int i = 0; i < stops.size(); i++) {
            BusStop bs = stops.get(i).getStop();
            if (bs == null || bs.getLocation() == null) continue;
            double slat = bs.getLocation().getY();
            double slon = bs.getLocation().getX();
            double d = haversineKm(lat, lon, slat, slon);
            if (d <= VISIT_RADIUS_KM) {
                lastVisitedIdx = i;  // a ultima paragem na sequencia em que esta' perto
            }
        }

        Long tripId = duty.getTrip().getId();
        long[] cached = progressByBus.get(busCode);
        if (cached != null && cached[0] == tripId) {
            // Mesma trip: cache nunca recua. Se nao estamos perto de nenhuma
            // paragem agora, usa o ultimo visitado em cache.
            if (lastVisitedIdx < (int) cached[1]) {
                lastVisitedIdx = (int) cached[1];
            }
        }
        if (lastVisitedIdx >= 0) {
            progressByBus.put(busCode, new long[] { tripId, lastVisitedIdx });
        }

        // Proxima paragem = seguinte a ultima visitada. Se ainda nao visitou
        // nenhuma (lastVisitedIdx == -1), a proxima e' a 1a (idx 0).
        int nextIdx;
        if (lastVisitedIdx < 0) {
            nextIdx = 0;
        } else {
            nextIdx = Math.min(lastVisitedIdx + 1, stops.size() - 1);
        }
        int closestIdx = lastVisitedIdx >= 0 ? lastVisitedIdx : nextIdx;
        BusStop next = stops.get(nextIdx).getStop();
        String name = (next != null) ? next.getName() : null;
        int remaining = stops.size() - 1 - closestIdx;
        if (remaining < 0) remaining = 0;
        return new NextStopInfo(name, remaining);
    }

    /** Haversine em km entre dois pontos lat/lon (formula standard, R=6371). */
    private static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                   Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                   Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    public List<BusHealthDTO> getBusHealthStatuses()
    {
        List<Bus> buses = busRepository.findAll();
        Instant now = Instant.now();

        // Saude da Rede IoT = visao da camada de telematica embarcada.
        // So' faz sentido para autocarros que (a) NAO estao descomissionados
        // (terminal: nao ha rede para reportar) e (b) TEM pelo menos um sensor
        // atribuido (sem sensor nao ha possivel "Online/Offline" — a celula
        // ficaria perpetuamente offline e poluia o dashboard).
        return buses.stream()
            .filter(bus -> !"DECOMMISSIONED".equals(bus.getStatus()))
            .filter(bus -> vehicleSensorRepository.existsByBusId(bus.getId()))
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
