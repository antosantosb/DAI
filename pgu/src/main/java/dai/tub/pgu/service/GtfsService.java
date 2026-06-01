package dai.tub.pgu.service;

import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.opencsv.CSVReader;
import com.opencsv.CSVReaderBuilder;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import dai.tub.pgu.domain.*;
import dai.tub.pgu.dto.GtfsConfigDTO;
import dai.tub.pgu.dto.GtfsImportDTO;
import dai.tub.pgu.dto.GtfsProgressDTO;
import dai.tub.pgu.dto.StopScheduleDTO;
import dai.tub.pgu.repository.*;

@Service
public class GtfsService
{
    private static final Logger log = LoggerFactory.getLogger(GtfsService.class);
    private static final String[] ROUTE_COLORS = {
        "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261",
        "#264653", "#6A0572", "#1D3557", "#A8DADC", "#F77F00"
    };

    /** Guarda para evitar sincronizações TUB concorrentes (cliques repetidos). */
    private final AtomicBoolean syncInProgress = new AtomicBoolean(false);

    private volatile GtfsProgressDTO lastProgress;

    private final GtfsImportRepository importRepository;
    private final GtfsImportEntityRepository importEntityRepository;
    private final GtfsConfigRepository configRepository;
    private final BusStopRepository busStopRepository;
    private final RouteRepository routeRepository;
    private final JourneyPatternRepository journeyPatternRepository;
    private final PatternStopRepository patternStopRepository;
    private final PatternSegmentRepository patternSegmentRepository;
    private final TripRepository tripRepository;
    private final TripStopTimeRepository tripStopTimeRepository;
    private final BusRepository busRepository;
    private final OperatorRepository operatorRepository;
    private final OsrmService osrmService;
    private final SimpMessagingTemplate ws;
    private final GeometryFactory geometryFactory;
    private final ObjectMapper objectMapper;
    private final GtfsService self;
    private final org.springframework.cache.CacheManager cacheManager;
    private final org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;
    private final Counter importSuccessCounter;
    private final Counter importFailedCounter;

    public GtfsService(GtfsImportRepository importRepository,
                       GtfsImportEntityRepository importEntityRepository,
                       GtfsConfigRepository configRepository,
                       BusStopRepository busStopRepository,
                       RouteRepository routeRepository,
                       JourneyPatternRepository journeyPatternRepository,
                       PatternStopRepository patternStopRepository,
                       PatternSegmentRepository patternSegmentRepository,
                       TripRepository tripRepository,
                       TripStopTimeRepository tripStopTimeRepository,
                       BusRepository busRepository,
                       OperatorRepository operatorRepository,
                       OsrmService osrmService,
                       SimpMessagingTemplate ws,
                       @org.springframework.context.annotation.Lazy GtfsService self,
                       org.springframework.cache.CacheManager cacheManager,
                       org.springframework.jdbc.core.JdbcTemplate jdbcTemplate,
                       MeterRegistry meterRegistry)
    {
        this.importRepository = importRepository;
        this.importEntityRepository = importEntityRepository;
        this.configRepository = configRepository;
        this.busStopRepository = busStopRepository;
        this.routeRepository = routeRepository;
        this.journeyPatternRepository = journeyPatternRepository;
        this.patternStopRepository = patternStopRepository;
        this.patternSegmentRepository = patternSegmentRepository;
        this.tripRepository = tripRepository;
        this.tripStopTimeRepository = tripStopTimeRepository;
        this.busRepository = busRepository;
        this.operatorRepository = operatorRepository;
        this.osrmService = osrmService;
        this.ws = ws;
        this.self = self;
        this.cacheManager = cacheManager;
        this.jdbcTemplate = jdbcTemplate;
        this.geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
        this.objectMapper = new ObjectMapper();
        this.importSuccessCounter = Counter.builder("gtfs.import.success")
                .description("Numero de importacoes GTFS concluidas com sucesso")
                .register(meterRegistry);
        this.importFailedCounter = Counter.builder("gtfs.import.failed")
                .description("Numero de importacoes GTFS falhadas")
                .register(meterRegistry);
    }

    private void importCalendars(Map<String, byte[]> files, GtfsImport imp)
    {
        try {
            // Limpar calendario anterior (substituido por este import)
            jdbcTemplate.update("DELETE FROM service_calendar");
            jdbcTemplate.update("DELETE FROM service_calendar_date");

            int cal = 0, calDates = 0;

            if (files.containsKey("calendar.txt")) {
                List<Map<String, String>> rows = parseCsv(files.get("calendar.txt"));
                for (Map<String, String> r : rows) {
                    String serviceId = r.getOrDefault("service_id", "").trim();
                    if (serviceId.isEmpty()) continue;
                    jdbcTemplate.update(
                        "INSERT INTO service_calendar (service_id, monday, tuesday, wednesday, "
                        + "thursday, friday, saturday, sunday, start_date, end_date, gtfs_import_id) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                        serviceId,
                        "1".equals(r.get("monday")), "1".equals(r.get("tuesday")),
                        "1".equals(r.get("wednesday")), "1".equals(r.get("thursday")),
                        "1".equals(r.get("friday")), "1".equals(r.get("saturday")),
                        "1".equals(r.get("sunday")),
                        parseGtfsDate(r.get("start_date")), parseGtfsDate(r.get("end_date")),
                        imp.getId());
                    cal++;
                }
            }

            if (files.containsKey("calendar_dates.txt")) {
                List<Map<String, String>> rows = parseCsv(files.get("calendar_dates.txt"));
                for (Map<String, String> r : rows) {
                    String serviceId = r.getOrDefault("service_id", "").trim();
                    java.sql.Date d = parseGtfsDate(r.get("date"));
                    if (serviceId.isEmpty() || d == null) continue;
                    int type = "2".equals(r.getOrDefault("exception_type", "1").trim()) ? 2 : 1;
                    jdbcTemplate.update(
                        "INSERT INTO service_calendar_date (service_id, exception_date, "
                        + "exception_type, gtfs_import_id) VALUES (?,?,?,?)",
                        serviceId, d, type, imp.getId());
                    calDates++;
                }
            }
            log.info("[GTFS] #{}: calendario importado — {} servicos, {} excecoes",
                    imp.getId(), cal, calDates);
        } catch (Exception e) {
            log.warn("[GTFS] #{}: falha a importar calendario: {}", imp.getId(), e.getMessage());
        }
    }

    /** Converte data GTFS (YYYYMMDD) para java.sql.Date. Devolve null se invalida. */
    private java.sql.Date parseGtfsDate(String yyyymmdd)
    {
        if (yyyymmdd == null) return null;
        String s = yyyymmdd.trim();
        if (s.length() != 8) return null;
        try {
            return java.sql.Date.valueOf(
                s.substring(0, 4) + "-" + s.substring(4, 6) + "-" + s.substring(6, 8));
        } catch (Exception e) {
            return null;
        }
    }

    /** Sprint 0 (F4 follow-up): invalida caches afetadas por um import GTFS. */
    private void evictRouteAndStopCaches()
    {
        try
        {
            org.springframework.cache.Cache routes = cacheManager.getCache("routes");
            if (routes != null) routes.clear();
            org.springframework.cache.Cache stops = cacheManager.getCache("stops");
            if (stops != null) stops.clear();
            org.springframework.cache.Cache gtfs = cacheManager.getCache("gtfs");
            if (gtfs != null) gtfs.clear();
        }
        catch (Exception e)
        {
            log.warn("[GTFS] Falha a invalidar caches: {}", e.getMessage());
        }
    }

    /** Sprint 0 (F4 follow-up): endpoint para resume do toast após refresh.
     *  Devolve null se nao ha sync activo nem progresso significativo. */
    public GtfsProgressDTO getLastProgress()
    {
        GtfsProgressDTO p = this.lastProgress;
        if (p == null) return null;
        // Se ja' acabou (COMPLETED/FAILED/SKIPPED) e nao ha sync activo, deixar de devolver.
        if (!syncInProgress.get() &&
            ("COMPLETED".equals(p.getStep())
             || "FAILED".equals(p.getStep())
             || "SKIPPED".equals(p.getStep())))
        {
            return null;
        }
        return p;
    }

    /** Envia progresso GTFS via WebSocket. */
    private void broadcastProgress(Long importId, String step, String message, int progress)
    {
        GtfsProgressDTO dto = new GtfsProgressDTO(importId, step, message, progress);
        this.lastProgress = dto;
        try
        {
            ws.convertAndSend("/topic/gtfs/progress", dto);
        }
        catch (Exception e)
        {
            log.debug("[GTFS] Falha ao enviar progresso WS: {}", e.getMessage());
        }
    }

    // ================================================================
    // API PÚBLICA
    // ================================================================

    // ─── Horários (Trip + TripStopTime) ─────────────────────────────

    public List<StopScheduleDTO> getSchedulesByStop(Long stopId)
    {
        return tripStopTimeRepository.findByStopIdFull(stopId).stream().map(this::toScheduleDTO).toList();
    }

    public List<StopScheduleDTO> getSchedulesByStopAndRoute(Long stopId, Long routeId)
    {
        return tripStopTimeRepository.findByStopIdAndRouteIdFull(stopId, routeId).stream().map(this::toScheduleDTO).toList();
    }

    public List<StopScheduleDTO> getSchedulesByRoute(Long routeId)
    {
        return tripStopTimeRepository.findByRouteIdFull(routeId).stream().map(this::toScheduleDTO).toList();
    }

    private StopScheduleDTO toScheduleDTO(TripStopTime t)
    {
        StopScheduleDTO dto = new StopScheduleDTO();
        Trip trip = t.getTrip();
        Route route = trip.getRoute();
        dto.setId(t.getId());
        dto.setRouteId(route.getId());
        dto.setRouteCode(route.getCode());
        dto.setRouteColor(route.getColor());
        dto.setStopId(t.getStop().getId());
        dto.setStopName(t.getStop().getName());
        dto.setStopCode(t.getStop().getCode());
        dto.setTripId(trip.getGtfsTripId());
        dto.setArrivalTime(t.getArrivalTime());
        dto.setDepartureTime(t.getDepartureTime());
        dto.setStopSequence(t.getStopSequence());
        dto.setDirectionId(trip.getPattern() != null ? trip.getPattern().getDirectionId() : 0);
        dto.setServiceId(trip.getServiceId());
        return dto;
    }

    // ─── Importações ───────────────────────────────────────────

    /** Lista todas as importações (mais recentes primeiro). */
    public List<GtfsImportDTO> listImports()
    {
        return importRepository.findAllByOrderByCreatedAtDesc()
                .stream().map(this::toDTO).toList();
    }

    /** Busca importação por ID. */
    public GtfsImportDTO getImport(Long id)
    {
        return toDTO(importRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Importação não encontrada: " + id)));
    }

    /** Processa upload de ficheiro ZIP. */
    @Async
    public void processUpload(byte[] zipBytes, String filename, String username)
    {
        GtfsImport imp = createImportRecord("UPLOAD", filename, username);
        broadcastProgress(imp.getId(), "PROCESSING_STOPS", "A processar ficheiro…", 10);
        try
        {
            Map<String, byte[]> files = extractZip(zipBytes);
            processGtfsFiles(imp, files);
            evictRouteAndStopCaches();
            broadcastProgress(imp.getId(), "COMPLETED", "Importação concluída", 100);
        }
        catch (Exception e)
        {
            failImport(imp, e);
            broadcastProgress(imp.getId(), "FAILED", "Erro: " + e.getMessage(), 0);
        }
    }

    /** Download do site TUB e processamento. */
    @Async
    public void processTubDownload(String source, String username)
    {
        if (!syncInProgress.compareAndSet(false, true))
        {
            log.warn("[GTFS] Sincronização TUB já em curso, a ignorar pedido duplicado");
            broadcastProgress(null, "SKIPPED", "Sincronização em curso", 0);
            return;
        }
        try
        {
            // ── Skip se dados recentes (qualquer fonte, não revertida) ──
            GtfsConfig config = getOrCreateConfig();
            List<GtfsImport> recent = importRepository.findLastCompleted();
            if (!recent.isEmpty())
            {
                Instant lastCompleted = recent.get(0).getFinishedAt();
                if (lastCompleted != null)
                {
                    long hoursSinceLast = java.time.Duration.between(lastCompleted, Instant.now()).toHours();
                    if (hoursSinceLast < config.getIntervalHours())
                    {
                        log.info("[GTFS] Dados GTFS ainda recentes (há {}h, intervalo={}h) — a saltar",
                                hoursSinceLast, config.getIntervalHours());
                        broadcastProgress(null, "SKIPPED", "Dados já atualizados", 0);
                        return;
                    }
                }
            }

            // ── Download + processamento ────────────────────────
            GtfsImport imp = createImportRecord(source, "tub.zip", username);
            broadcastProgress(imp.getId(), "DOWNLOADING", "A descarregar feed…", 5);
            try
            {
                log.info("[GTFS] A descarregar de {} ...", config.getGtfsUrl());
                byte[] zipBytes = URI.create(config.getGtfsUrl()).toURL().openStream().readAllBytes();
                log.info("[GTFS] Download completo ({} KB)", zipBytes.length / 1024);

                broadcastProgress(imp.getId(), "PROCESSING_STOPS", "A processar paragens…", 20);
                Map<String, byte[]> files = extractZip(zipBytes);
                processGtfsFiles(imp, files);
                evictRouteAndStopCaches();
                broadcastProgress(imp.getId(), "COMPLETED", "Sincronização concluída", 100);
            }
            catch (Exception e)
            {
                failImport(imp, e);
                broadcastProgress(imp.getId(), "FAILED", "Erro: " + e.getMessage(), 0);
            }
        }
        finally
        {
            syncInProgress.set(false);
        }
    }

    /** Valida ZIP e retorna preview sem importar. */
    public Map<String, Object> previewZip(byte[] zipBytes) throws IOException
    {
        Map<String, byte[]> files = extractZip(zipBytes);
        Map<String, Object> preview = new LinkedHashMap<>();

        preview.put("files", new ArrayList<>(files.keySet()));

        if (files.containsKey("stops.txt"))
        {
            List<Map<String, String>> stops = parseCsv(files.get("stops.txt"));
            preview.put("stopsCount", stops.size());
        }
        if (files.containsKey("routes.txt"))
        {
            List<Map<String, String>> routes = parseCsv(files.get("routes.txt"));
            preview.put("routesCount", routes.size());
        }
        if (files.containsKey("shapes.txt"))
        {
            List<Map<String, String>> shapes = parseCsv(files.get("shapes.txt"));
            long uniqueShapes = shapes.stream()
                    .map(s -> s.getOrDefault("shape_id", ""))
                    .distinct().count();
            preview.put("shapesCount", uniqueShapes);
        }
        if (files.containsKey("trips.txt"))
        {
            List<Map<String, String>> trips = parseCsv(files.get("trips.txt"));
            preview.put("tripsCount", trips.size());
        }

        // Validação
        List<String> warnings = new ArrayList<>();
        if (!files.containsKey("stops.txt")) warnings.add("stops.txt não encontrado — nenhuma paragem será importada");
        if (!files.containsKey("routes.txt")) warnings.add("routes.txt não encontrado — nenhuma rota será importada");
        if (!files.containsKey("shapes.txt")) warnings.add("shapes.txt não encontrado — será usado OSRM como fallback para geometria");
        if (!files.containsKey("trips.txt") || !files.containsKey("stop_times.txt"))
            warnings.add("trips.txt ou stop_times.txt não encontrado — associação rota↔paragem indisponível");
        preview.put("warnings", warnings);
        preview.put("valid", files.containsKey("stops.txt") || files.containsKey("routes.txt"));

        return preview;
    }

    /** Reverte uma importação (apaga entidades criadas). */
    @Transactional
    public GtfsImportDTO revertImport(Long importId)
    {
        GtfsImport imp = importRepository.findById(importId)
                .orElseThrow(() -> new RuntimeException("Importação não encontrada: " + importId));

        if (!"COMPLETED".equals(imp.getStatus()))
            throw new RuntimeException("Só é possível reverter importações concluídas");
        if (imp.getRevertedAt() != null)
            throw new RuntimeException("Esta importação já foi revertida");

        // Verificar dependências antes de reverter
        List<String> blockers = checkRevertBlockers(importId);
        if (!blockers.isEmpty())
            throw new RuntimeException("Não é possível reverter: " + String.join("; ", blockers));

        log.info("[GTFS] A reverter importação #{}", importId);

        // Apagar padroes e trips desta importacao.
        // O cascade DB (ON DELETE CASCADE) trata de pattern_stop, pattern_segment e trip_stop_time.
        journeyPatternRepository.deleteByImportId(importId);
        tripRepository.deleteByImportId(importId);

        // Apagar rotas e paragens criadas (rastreadas via GtfsImportEntity).
        List<Long> routeIds = importEntityRepository.findEntityIdsByImportIdAndType(importId, "ROUTE");
        if (!routeIds.isEmpty())
        {
            List<Route> routes = routeRepository.findAllById(routeIds);
            routeRepository.deleteAll(routes);
        }

        List<Long> stopIds = importEntityRepository.findEntityIdsByImportIdAndType(importId, "STOP");
        if (!stopIds.isEmpty()) busStopRepository.deleteAllById(stopIds);

        importEntityRepository.deleteByImportId(importId);

        imp.setStatus("REVERTED");
        imp.setRevertedAt(Instant.now());
        evictRouteAndStopCaches();
        importRepository.save(imp);

        log.info("[GTFS] Importação #{} revertida com sucesso", importId);
        return toDTO(imp);
    }

    /** Verifica se é seguro reverter. */
    public List<String> checkRevertBlockers(Long importId)
    {
        List<String> blockers = new ArrayList<>();

        // Verificar se rotas desta importação têm autocarros ativos
        List<Long> routeIds = importEntityRepository.findEntityIdsByImportIdAndType(importId, "ROUTE");
        if (!routeIds.isEmpty())
        {
            long activeBuses = busRepository.findAll().stream()
                    .filter(b -> b.getRoute() != null && routeIds.contains(b.getRoute().getId()))
                    .filter(b -> !"STOPPED".equals(b.getStatus()))
                    .count();
            if (activeBuses > 0)
                blockers.add(activeBuses + " autocarro(s) ativo(s) usam rotas desta importação");
        }

        return blockers;
    }

    // ================================================================
    // CONFIGURAÇÃO DE AGENDAMENTO
    // ================================================================

    public GtfsConfigDTO getConfig()
    {
        GtfsConfig config = getOrCreateConfig();
        GtfsConfigDTO dto = new GtfsConfigDTO();
        dto.setScheduleActive(config.isScheduleActive());
        dto.setIntervalHours(config.getIntervalHours());
        dto.setGtfsUrl(config.getGtfsUrl());

        if (config.isScheduleActive())
        {
            // Calcular próxima execução com base na última importação scheduled (não-falhada)
            List<GtfsImport> lastList = importRepository.findLastSuccessfulScheduled();
            if (!lastList.isEmpty())
            {
                dto.setNextRun(lastList.get(0).getCreatedAt()
                        .plusSeconds((long) config.getIntervalHours() * 3600));
            }
        }
        return dto;
    }

    @Transactional
    public GtfsConfigDTO updateConfig(GtfsConfigDTO dto, String username)
    {
        GtfsConfig config = getOrCreateConfig();
        boolean wasInactive = !config.isScheduleActive();
        config.setScheduleActive(dto.isScheduleActive());
        if (dto.getIntervalHours() > 0) config.setIntervalHours(dto.getIntervalHours());
        if (dto.getGtfsUrl() != null && !dto.getGtfsUrl().isBlank()) config.setGtfsUrl(dto.getGtfsUrl());
        config.setUpdatedAt(Instant.now());
        configRepository.save(config);

        // Se acabou de ativar o agendamento, dispara sincronização imediata
        if (wasInactive && dto.isScheduleActive())
        {
            log.info("[GTFS] Agendamento ativado — a iniciar sincronização imediata por {}", username);
            self.processTubDownload("TUB_SCHEDULED", username);
        }

        return getConfig();
    }

    /** Chamado pelo scheduler periódico. */
    public void runScheduledSync()
    {
        GtfsConfig config = getOrCreateConfig();
        if (!config.isScheduleActive())
        {
            log.debug("[GTFS] Agendamento desativado, a ignorar");
            return;
        }

        // Verificar se já passou o intervalo desde a última execução (query dedicada)
        List<GtfsImport> lastList = importRepository.findLastSuccessfulScheduled();
        if (!lastList.isEmpty())
        {
            Instant nextAllowed = lastList.get(0).getCreatedAt()
                    .plusSeconds((long) config.getIntervalHours() * 3600);
            if (Instant.now().isBefore(nextAllowed))
            {
                log.debug("[GTFS] Agendamento: próxima execução em {}", nextAllowed);
                return;
            }
        }

        log.info("[GTFS] Agendamento ativado — a iniciar sincronização TUB");
        self.processTubDownload("TUB_SCHEDULED", "system-scheduler");
    }

    // ================================================================
    // LÓGICA INTERNA DE PROCESSAMENTO GTFS
    // ================================================================

    @Transactional
    void processGtfsFiles(GtfsImport imp, Map<String, byte[]> files)
    {
        try
        {
            int stopsCreated = 0, stopsUpdated = 0;
            int routesCreated = 0, routesUpdated = 0;
            int shapesLoaded = 0;

            Map<String, Long> stopIdMap = new HashMap<>();        // GTFS stop_id → DB id
            Map<String, double[]> stopCoordMap = new HashMap<>(); // GTFS stop_id → [lat, lon] (p/ OSRM)

            // 1. CARREGAR PARAGENS
            if (files.containsKey("stops.txt"))
            {
                List<Map<String, String>> stops = parseCsv(files.get("stops.txt"));
                log.info("[GTFS] #{}: {} paragens encontradas", imp.getId(), stops.size());

                for (Map<String, String> stop : stops)
                {
                    String code = "P" + stop.get("stop_id");
                    String name = stop.getOrDefault("stop_name", "").trim();
                    double lat = Double.parseDouble(stop.get("stop_lat"));
                    double lon = Double.parseDouble(stop.get("stop_lon"));

                    Optional<BusStop> existing = busStopRepository.findByCode(code);
                    BusStop entity = existing.orElse(new BusStop());
                    boolean isNew = entity.getId() == null;

                    entity.setName(name);
                    entity.setCode(code);
                    entity.setLocation(geometryFactory.createPoint(new Coordinate(lon, lat)));

                    BusStop saved = busStopRepository.save(entity);
                    stopIdMap.put(stop.get("stop_id"), saved.getId());
                    stopCoordMap.put(stop.get("stop_id"), new double[]{lat, lon});

                    if (isNew)
                    {
                        stopsCreated++;
                        importEntityRepository.save(new GtfsImportEntity(imp, "STOP", saved.getId()));
                    }
                    else
                    {
                        stopsUpdated++;
                    }
                }
                log.info("[GTFS] #{}: Paragens — {} criadas, {} atualizadas",
                        imp.getId(), stopsCreated, stopsUpdated);
            }

            broadcastProgress(imp.getId(), "PROCESSING_ROUTES", "A mapear viagens…", 40);

            // 2. TRIPS + STOP_TIMES → PADRÕES (dedup por assinatura de sequência)
            // trip_id → {route_id, direction_id, service_id, shape_id, headsign}
            Map<String, Map<String, String>> tripInfo = new HashMap<>();
            // trip_id → [{stop_id, sequence, arrival, departure}] (ordenado por sequence)
            Map<String, List<String[]>> tripStops = new HashMap<>();

            if (files.containsKey("trips.txt") && files.containsKey("stop_times.txt"))
            {
                List<Map<String, String>> trips = parseCsv(files.get("trips.txt"));
                for (Map<String, String> trip : trips)
                {
                    Map<String, String> info = new HashMap<>();
                    info.put("route_id", trip.get("route_id"));
                    info.put("direction_id", trip.getOrDefault("direction_id", "0"));
                    info.put("service_id", trip.getOrDefault("service_id", ""));
                    info.put("shape_id", trip.getOrDefault("shape_id", "").trim());
                    info.put("headsign", trip.getOrDefault("trip_headsign", "").trim());
                    tripInfo.put(trip.get("trip_id"), info);
                }

                List<Map<String, String>> stopTimes = parseCsv(files.get("stop_times.txt"));
                for (Map<String, String> st : stopTimes)
                {
                    String tid = st.get("trip_id");
                    if (!tripInfo.containsKey(tid)) continue;
                    tripStops.computeIfAbsent(tid, k -> new ArrayList<>()).add(new String[]{
                        st.get("stop_id"),
                        st.getOrDefault("stop_sequence", "0"),
                        st.getOrDefault("arrival_time", "").trim(),
                        st.getOrDefault("departure_time", "").trim()
                    });
                }
                tripStops.values().forEach(list ->
                        list.sort(Comparator.comparingInt(a -> parseIntSafe(a[1], 0))));
            }

            // Agrupar trips por gtfs route_id → assinatura → padrão.
            Map<String, Map<String, PatternAgg>> patternsByRoute = new HashMap<>();
            List<String> orderedTripIds = new ArrayList<>(tripInfo.keySet());
            Collections.sort(orderedTripIds); // determinismo
            for (String tid : orderedTripIds)
            {
                List<String[]> stops = tripStops.get(tid);
                if (stops == null || stops.isEmpty()) continue;
                Map<String, String> info = tripInfo.get(tid);
                String gtfsRouteId = info.get("route_id");
                int dir = parseIntSafe(info.getOrDefault("direction_id", "0"), 0);

                StringBuilder sigSb = new StringBuilder().append(dir).append(':');
                for (String[] s : stops) sigSb.append(s[0]).append(',');
                String signature = sha256Hex(sigSb.toString());

                Map<String, PatternAgg> byRoute =
                        patternsByRoute.computeIfAbsent(gtfsRouteId, k -> new LinkedHashMap<>());
                PatternAgg agg = byRoute.get(signature);
                if (agg == null)
                {
                    agg = new PatternAgg();
                    agg.directionId = dir;
                    agg.stopTemplate = stops; // ordem ja' garantida
                    agg.shapeId = info.getOrDefault("shape_id", "");
                    String hs = info.getOrDefault("headsign", "");
                    agg.name = hs.isEmpty() ? null : hs;
                    byRoute.put(signature, agg);
                }
                agg.tripIds.add(tid);
            }

            // 3. CARREGAR SHAPES
            Map<String, List<List<Double>>> shapesMap = new HashMap<>();
            if (files.containsKey("shapes.txt"))
            {
                List<Map<String, String>> shapesRaw = parseCsv(files.get("shapes.txt"));
                log.info("[GTFS] #{}: {} pontos de shape encontrados", imp.getId(), shapesRaw.size());

                if (!shapesRaw.isEmpty())
                {
                    Map<String, String> sample = shapesRaw.get(0);
                    String latKey = sample.keySet().stream().filter(k -> k.toLowerCase().contains("lat")).findFirst().orElse("shape_pt_lat");
                    String lonKey = sample.keySet().stream().filter(k -> k.toLowerCase().contains("lon")).findFirst().orElse("shape_pt_lon");
                    String seqKey = sample.keySet().stream().filter(k -> k.toLowerCase().contains("sequence")).findFirst().orElse("shape_pt_sequence");

                    Map<String, List<Map<String, String>>> grouped = new LinkedHashMap<>();
                    for (Map<String, String> row : shapesRaw)
                    {
                        String sid = row.getOrDefault("shape_id", "").trim();
                        if (!sid.isEmpty())
                            grouped.computeIfAbsent(sid, k -> new ArrayList<>()).add(row);
                    }

                    for (Map.Entry<String, List<Map<String, String>>> entry : grouped.entrySet())
                    {
                        List<Map<String, String>> points = entry.getValue();
                        points.sort(Comparator.comparingInt(p ->
                                parseIntSafe(p.getOrDefault(seqKey, "0"), 0)));

                        List<List<Double>> coords = new ArrayList<>();
                        for (Map<String, String> p : points)
                        {
                            try
                            {
                                double lat = Double.parseDouble(p.get(latKey).trim());
                                double lon = Double.parseDouble(p.get(lonKey).trim());
                                coords.add(List.of(lat, lon));
                            }
                            catch (Exception ignored) {}
                        }
                        if (!coords.isEmpty()) shapesMap.put(entry.getKey(), coords);
                    }
                }
                shapesLoaded = shapesMap.size();
                log.info("[GTFS] #{}: {} shapes carregados", imp.getId(), shapesLoaded);
            }

            // Sprint 1 (F0): processar agency.txt -> Operators (R.IVT.03).
            Map<String, Operator> agencyByGtfsId = new HashMap<>();
            Operator defaultOperator = operatorRepository.findByCode("TUB").orElse(null);
            if (files.containsKey("agency.txt"))
            {
                List<Map<String, String>> agencies = parseCsv(files.get("agency.txt"));
                log.info("[GTFS] #{}: {} operadores em agency.txt", imp.getId(), agencies.size());
                for (Map<String, String> row : agencies)
                {
                    String gtfsAgencyId = row.getOrDefault("agency_id", "").trim();
                    String agencyName = row.getOrDefault("agency_name", "").trim();
                    String agencyEmail = row.getOrDefault("agency_email", "").trim();
                    if (agencyName.isEmpty()) continue;

                    String code = !gtfsAgencyId.isEmpty()
                            ? gtfsAgencyId.toUpperCase()
                            : agencyName.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
                    if (code.length() > 32) code = code.substring(0, 32);

                    Operator op = operatorRepository.findByCode(code).orElseGet(Operator::new);
                    op.setCode(code);
                    op.setName(agencyName);
                    if (!agencyEmail.isEmpty()) op.setContactEmail(agencyEmail);
                    if (op.getCountry() == null || op.getCountry().isBlank()) op.setCountry("PT");
                    op = operatorRepository.save(op);

                    String mapKey = !gtfsAgencyId.isEmpty() ? gtfsAgencyId : "_default";
                    agencyByGtfsId.put(mapKey, op);
                    if (defaultOperator == null) defaultOperator = op;
                }
            }

            // Sprint 1 (F4): importar calendar.txt + calendar_dates.txt (R.IVT.05)
            importCalendars(files, imp);

            broadcastProgress(imp.getId(), "PROCESSING_ROUTES", "A importar rotas…", 60);

            // 4. CARREGAR ROTAS + PADRÕES + TRIPS
            if (files.containsKey("routes.txt"))
            {
                List<Map<String, String>> routes = parseCsv(files.get("routes.txt"));
                log.info("[GTFS] #{}: {} rotas encontradas", imp.getId(), routes.size());

                int colorIdx = 0;
                for (Map<String, String> route : routes)
                {
                    String gtfsRouteId = route.get("route_id");
                    String shortName = route.getOrDefault("route_short_name", "").trim();
                    String longName = route.getOrDefault("route_long_name", "").trim();
                    String name = !longName.isEmpty() ? longName : shortName;
                    String code = !shortName.isEmpty() ? shortName : ("R" + gtfsRouteId);
                    String gtfsColor = route.getOrDefault("route_color", "").trim();
                    String color = !gtfsColor.isEmpty() ? "#" + gtfsColor : ROUTE_COLORS[colorIdx % ROUTE_COLORS.length];
                    String routeAgencyId = route.getOrDefault("agency_id", "").trim();
                    colorIdx++;

                    Optional<Route> existing = routeRepository.findByCode(code);
                    Route entity = existing.orElse(new Route());
                    boolean isNew = entity.getId() == null;

                    entity.setName(name);
                    entity.setCode(code);
                    entity.setColor(color);

                    // Sprint 1 (F0): associar operador (agency.txt -> Operator), com fallback ao default 'TUB'.
                    Operator op = null;
                    if (!routeAgencyId.isEmpty()) op = agencyByGtfsId.get(routeAgencyId);
                    if (op == null) op = agencyByGtfsId.get("_default");
                    if (op == null) op = defaultOperator;
                    if (op != null) entity.setOperator(op);

                    // Re-import de rota existente: limpar padroes/trips antigos (cascade trata dos filhos).
                    if (!isNew) journeyPatternRepository.deleteByRouteId(entity.getId());

                    Route saved = routeRepository.save(entity);

                    if (isNew)
                    {
                        routesCreated++;
                        importEntityRepository.save(new GtfsImportEntity(imp, "ROUTE", saved.getId()));
                    }
                    else
                    {
                        routesUpdated++;
                    }

                    Map<String, PatternAgg> patterns = patternsByRoute.get(gtfsRouteId);
                    if (patterns == null || patterns.isEmpty())
                    {
                        log.warn("[GTFS] #{}: Rota {} sem padroes (trips/stop_times em falta)", imp.getId(), code);
                        continue;
                    }

                    int tripsCreated = 0;
                    for (PatternAgg agg : patterns.values())
                    {
                        // Padrão
                        JourneyPattern jp = new JourneyPattern();
                        jp.setRoute(saved);
                        jp.setDirectionId(agg.directionId);
                        jp.setSignature(agg.signatureOf());
                        jp.setName(agg.name);
                        jp.setGtfsImport(imp);
                        jp = journeyPatternRepository.save(jp);

                        // Paragens do padrão
                        List<PatternStop> psBatch = new ArrayList<>();
                        for (String[] s : agg.stopTemplate)
                        {
                            Long stopDbId = stopIdMap.get(s[0]);
                            if (stopDbId == null) continue;
                            PatternStop ps = new PatternStop();
                            ps.setPattern(jp);
                            ps.setStop(busStopRepository.getReferenceById(stopDbId));
                            ps.setStopSequence(parseIntSafe(s[1], 0));
                            psBatch.add(ps);
                        }
                        if (!psBatch.isEmpty()) patternStopRepository.saveAll(psBatch);

                        // Geometria do padrão: PARTE do shape GTFS dos TUB (o corredor que eles
                        // desenharam) e usa OSRM SO para remendar os troços com saltos grandes
                        // (rectas longas). Os troços já bons ficam intactos. Sem shape, usa
                        // OSRM a passar pelas paragens; em ultimo caso, rectas.
                        try
                        {
                            int firstSeq = parseIntSafe(agg.stopTemplate.get(0)[1], 1);
                            int lastSeq = parseIntSafe(agg.stopTemplate.get(agg.stopTemplate.size() - 1)[1], 1);

                            List<List<Double>> geom;
                            if (agg.shapeId != null && !agg.shapeId.isEmpty() && shapesMap.containsKey(agg.shapeId))
                            {
                                geom = refineShapeWithOsrm(shapesMap.get(agg.shapeId)); // mantem TUB, remenda saltos
                            }
                            else
                            {
                                List<double[]> coords = new ArrayList<>();
                                for (String[] s : agg.stopTemplate)
                                {
                                    double[] c = stopCoordMap.get(s[0]);
                                    if (c != null) coords.add(c);
                                }
                                geom = coords.size() >= 2 ? osrmService.getRouteThrough(coords) : null;
                                if (geom == null || geom.size() < 2)
                                {
                                    geom = new ArrayList<>();
                                    for (double[] c : coords) geom.add(List.of(c[0], c[1]));
                                }
                            }

                            if (geom != null && geom.size() >= 2)
                            {
                                PatternSegment seg = new PatternSegment();
                                seg.setPattern(jp);
                                seg.setFromSequence(firstSeq);
                                seg.setToSequence(lastSeq);
                                seg.setPoints(objectMapper.writeValueAsString(geom));
                                patternSegmentRepository.save(seg);
                            }
                        }
                        catch (Exception e)
                        {
                            log.warn("[GTFS] #{}: Erro na geometria do padrao da rota {}: {}",
                                    imp.getId(), code, e.getMessage());
                        }

                        // Trips do padrão + horas (TripStopTime)
                        final int BATCH_SIZE = 200;
                        List<TripStopTime> tstBatch = new ArrayList<>(BATCH_SIZE);
                        for (String tid : agg.tripIds)
                        {
                            Map<String, String> ti = tripInfo.get(tid);
                            String hs = ti.getOrDefault("headsign", "");

                            Trip t = new Trip();
                            t.setPattern(jp);
                            t.setRoute(saved);
                            t.setServiceId(ti.getOrDefault("service_id", ""));
                            t.setHeadsign(hs.isEmpty() ? null : hs);
                            t.setGtfsTripId(tid);
                            t.setGtfsImport(imp);
                            t = tripRepository.save(t);
                            tripsCreated++;

                            List<String[]> stops = tripStops.get(tid);
                            if (stops == null) continue;
                            for (String[] s : stops)
                            {
                                Long stopDbId = stopIdMap.get(s[0]);
                                if (stopDbId == null) continue;
                                String arrival = s[2], departure = s[3];
                                if (arrival.isEmpty() && departure.isEmpty()) continue;

                                TripStopTime tst = new TripStopTime();
                                tst.setTrip(t);
                                tst.setStop(busStopRepository.getReferenceById(stopDbId));
                                tst.setStopSequence(parseIntSafe(s[1], 0));
                                tst.setArrivalTime(arrival.isEmpty() ? departure : arrival);
                                tst.setDepartureTime(departure.isEmpty() ? arrival : departure);
                                tstBatch.add(tst);
                                if (tstBatch.size() >= BATCH_SIZE)
                                {
                                    tripStopTimeRepository.saveAll(tstBatch);
                                    tripStopTimeRepository.flush();
                                    tstBatch.clear();
                                }
                            }
                        }
                        if (!tstBatch.isEmpty())
                        {
                            tripStopTimeRepository.saveAll(tstBatch);
                            tripStopTimeRepository.flush();
                            tstBatch.clear();
                        }
                    }

                    log.info("[GTFS] #{}: Rota {} — {} padroes, {} trips",
                            imp.getId(), code, patterns.size(), tripsCreated);
                }

                log.info("[GTFS] #{}: Rotas — {} criadas, {} atualizadas",
                        imp.getId(), routesCreated, routesUpdated);
            }

            broadcastProgress(imp.getId(), "PROCESSING_SCHEDULES", "A finalizar…", 90);

            // Finalizar importação
            imp.setStopsCreated(stopsCreated);
            imp.setStopsUpdated(stopsUpdated);
            imp.setRoutesCreated(routesCreated);
            imp.setRoutesUpdated(routesUpdated);
            imp.setShapesLoaded(shapesLoaded);
            imp.setStatus("COMPLETED");
            imp.setFinishedAt(Instant.now());
            importRepository.save(imp);
            // Sprint 1 (F9): metrica de import bem sucedido.
            importSuccessCounter.increment();

            log.info("[GTFS] #{}: Importação concluída — {} paragens (+{}upd), {} rotas (+{}upd), {} shapes",
                    imp.getId(), stopsCreated, stopsUpdated, routesCreated, routesUpdated, shapesLoaded);
        }
        catch (Exception e)
        {
            // Sprint 1 (F9): metrica de import falhado.
            importFailedCounter.increment();
            failImport(imp, e);
            throw new RuntimeException("Falha no processamento GTFS", e);
        }
    }

    // ================================================================
    // UTILITÁRIOS
    // ================================================================

    /** Agregado em memoria de um padrao durante o import. */
    private static final class PatternAgg
    {
        int directionId;
        List<String[]> stopTemplate;       // [{stop_id, sequence, arrival, departure}]
        String shapeId;
        String name;
        final List<String> tripIds = new ArrayList<>();

        /** Recalcula a assinatura (direcao + stop_ids ordenados). */
        String signatureOf()
        {
            StringBuilder sb = new StringBuilder().append(directionId).append(':');
            for (String[] s : stopTemplate) sb.append(s[0]).append(',');
            return sha256Hex(sb.toString());
        }
    }

    /** SHA-256 em hex (64 chars) da string dada. Fallback para hashCode em hex. */
    private static String sha256Hex(String s)
    {
        try
        {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : d) sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            return sb.toString();
        }
        catch (Exception e)
        {
            return Integer.toHexString(s.hashCode());
        }
    }

    private static int parseIntSafe(String s, int def)
    {
        if (s == null) return def;
        try { return Integer.parseInt(s.trim()); } catch (Exception e) { return def; }
    }

    /**
     * Mantem o shape GTFS dos TUB e usa OSRM SO para remendar os troços com
     * saltos grandes (rectas longas, &gt; ~250m entre pontos consecutivos),
     * inserindo o caminho real da estrada. Os troços bons ficam intactos.
     */
    private List<List<Double>> refineShapeWithOsrm(List<List<Double>> shape)
    {
        final double GAP_THRESHOLD_M = 250.0;
        if (shape == null || shape.size() < 2) return shape;

        List<List<Double>> out = new ArrayList<>();
        for (int i = 0; i < shape.size() - 1; i++)
        {
            List<Double> a = shape.get(i), b = shape.get(i + 1);
            out.add(a);
            double d = haversineMeters(a.get(0), a.get(1), b.get(0), b.get(1));
            if (d > GAP_THRESHOLD_M)
            {
                List<List<Double>> leg = osrmService.getRoute(a.get(0), a.get(1), b.get(0), b.get(1));
                if (leg != null && leg.size() > 2)
                {
                    // inserir só os pontos intermédios (extremos a/b já existem no shape)
                    for (int k = 1; k < leg.size() - 1; k++) out.add(leg.get(k));
                }
            }
        }
        out.add(shape.get(shape.size() - 1));
        return out;
    }

    private static double haversineMeters(double lat1, double lon1, double lat2, double lon2)
    {
        double R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1), dLon = Math.toRadians(lon2 - lon1);
        double x = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }

    private GtfsImport createImportRecord(String source, String filename, String username)
    {
        GtfsImport imp = new GtfsImport();
        imp.setSource(source);
        imp.setStatus("PROCESSING");
        imp.setFilename(filename);
        imp.setCreatedBy(username);
        return importRepository.save(imp);
    }

    private void failImport(GtfsImport imp, Exception e)
    {
        log.error("[GTFS] #{}: Erro — {}", imp.getId(), e.getMessage(), e);
        imp.setStatus("FAILED");
        imp.setErrorMessage(e.getMessage());
        imp.setFinishedAt(Instant.now());
        importRepository.save(imp);
    }

    private GtfsConfig getOrCreateConfig()
    {
        return configRepository.findAll().stream().findFirst().orElseGet(() -> {
            GtfsConfig c = new GtfsConfig();
            c.setScheduleActive(false);
            c.setIntervalHours(24);
            c.setGtfsUrl("https://www.tub.pt/developer/gtfs/feed/tub.zip");
            return configRepository.save(c);
        });
    }

    private Map<String, byte[]> extractZip(byte[] zipBytes) throws IOException
    {
        Map<String, byte[]> files = new LinkedHashMap<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes)))
        {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null)
            {
                if (!entry.isDirectory())
                {
                    String name = entry.getName();
                    if (name.contains("/")) name = name.substring(name.lastIndexOf('/') + 1);
                    files.put(name.toLowerCase(), zis.readAllBytes());
                }
                zis.closeEntry();
            }
        }
        return files;
    }

    private List<Map<String, String>> parseCsv(byte[] csvBytes) throws IOException
    {
        List<Map<String, String>> result = new ArrayList<>();
        try (CSVReader reader = new CSVReaderBuilder(
                new InputStreamReader(new ByteArrayInputStream(csvBytes), StandardCharsets.UTF_8))
                .build())
        {
            String[] headers = reader.readNext();
            if (headers == null) return result;

            // Limpar BOM do primeiro header
            headers[0] = headers[0].replace("﻿", "").trim();
            for (int i = 0; i < headers.length; i++) headers[i] = headers[i].trim();

            String[] line;
            while ((line = reader.readNext()) != null)
            {
                Map<String, String> row = new LinkedHashMap<>();
                for (int i = 0; i < headers.length && i < line.length; i++)
                {
                    row.put(headers[i], line[i]);
                }
                result.add(row);
            }
        }
        catch (Exception e)
        {
            throw new IOException("Erro ao processar CSV: " + e.getMessage(), e);
        }
        return result;
    }

    private GtfsImportDTO toDTO(GtfsImport entity)
    {
        GtfsImportDTO dto = new GtfsImportDTO();
        dto.setId(entity.getId());
        dto.setSource(entity.getSource());
        dto.setStatus(entity.getStatus());
        dto.setFilename(entity.getFilename());
        dto.setStopsCreated(entity.getStopsCreated());
        dto.setStopsUpdated(entity.getStopsUpdated());
        dto.setRoutesCreated(entity.getRoutesCreated());
        dto.setRoutesUpdated(entity.getRoutesUpdated());
        dto.setShapesLoaded(entity.getShapesLoaded());
        dto.setSchedulesLoaded(tripStopTimeRepository.countByImportId(entity.getId()));
        dto.setErrorMessage(entity.getErrorMessage());
        dto.setCreatedBy(entity.getCreatedBy());
        dto.setCreatedAt(entity.getCreatedAt());
        dto.setFinishedAt(entity.getFinishedAt());
        dto.setRevertedAt(entity.getRevertedAt());

        // Verificar se pode reverter
        if ("COMPLETED".equals(entity.getStatus()) && entity.getRevertedAt() == null)
        {
            dto.setCanRevert(checkRevertBlockers(entity.getId()).isEmpty());
        }
        return dto;
    }
}
