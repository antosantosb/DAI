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

    /** Sprint 0 (F4 follow-up): último estado da sincronização para o
     *  endpoint GET /gtfs/sync-status (resume do toast após refresh do browser). */
    private volatile GtfsProgressDTO lastProgress;

    private final GtfsImportRepository importRepository;
    private final GtfsImportEntityRepository importEntityRepository;
    private final GtfsConfigRepository configRepository;
    private final BusStopRepository busStopRepository;
    private final RouteRepository routeRepository;
    private final RouteStopRepository routeStopRepository;
    private final RouteSegmentRepository segmentRepository;
    private final StopScheduleRepository scheduleRepository;
    private final BusRepository busRepository;
    private final SimpMessagingTemplate ws;
    private final GeometryFactory geometryFactory;
    private final ObjectMapper objectMapper;
    // Sprint 0 (F4 follow-up): self-reference via @Lazy para o proxy do Spring
    // intercetar self-calls a metodos @Async. Sem isto, processTubDownload
    // corre na thread do request HTTP e o user vê timeouts no frontend.
    private final GtfsService self;
    // Sprint 0 (F4 follow-up): invalidar cache "routes" (definida em F2 no
    // RouteService) apos o import GTFS. Sem isto, o backoffice continua a ver
    // as rotas antigas (cache TTL 10min).
    private final org.springframework.cache.CacheManager cacheManager;

    public GtfsService(GtfsImportRepository importRepository,
                       GtfsImportEntityRepository importEntityRepository,
                       GtfsConfigRepository configRepository,
                       BusStopRepository busStopRepository,
                       RouteRepository routeRepository,
                       RouteStopRepository routeStopRepository,
                       RouteSegmentRepository segmentRepository,
                       StopScheduleRepository scheduleRepository,
                       BusRepository busRepository,
                       SimpMessagingTemplate ws,
                       @org.springframework.context.annotation.Lazy GtfsService self,
                       org.springframework.cache.CacheManager cacheManager)
    {
        this.importRepository = importRepository;
        this.importEntityRepository = importEntityRepository;
        this.configRepository = configRepository;
        this.busStopRepository = busStopRepository;
        this.routeRepository = routeRepository;
        this.routeStopRepository = routeStopRepository;
        this.segmentRepository = segmentRepository;
        this.scheduleRepository = scheduleRepository;
        this.busRepository = busRepository;
        this.ws = ws;
        this.self = self;
        this.cacheManager = cacheManager;
        this.geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
        this.objectMapper = new ObjectMapper();
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

    // ─── Horários (stop_schedule) ─────────────────────────────

    public List<StopScheduleDTO> getSchedulesByStop(Long stopId)
    {
        return scheduleRepository.findByStopId(stopId).stream().map(this::toScheduleDTO).toList();
    }

    public List<StopScheduleDTO> getSchedulesByStopAndRoute(Long stopId, Long routeId)
    {
        return scheduleRepository.findByStopIdAndRouteId(stopId, routeId).stream().map(this::toScheduleDTO).toList();
    }

    public List<StopScheduleDTO> getSchedulesByRoute(Long routeId)
    {
        return scheduleRepository.findByRouteId(routeId).stream().map(this::toScheduleDTO).toList();
    }

    private StopScheduleDTO toScheduleDTO(StopSchedule s)
    {
        StopScheduleDTO dto = new StopScheduleDTO();
        dto.setId(s.getId());
        dto.setRouteId(s.getRoute().getId());
        dto.setRouteCode(s.getRoute().getCode());
        dto.setRouteColor(s.getRoute().getColor());
        dto.setStopId(s.getStop().getId());
        dto.setStopName(s.getStop().getName());
        dto.setStopCode(s.getStop().getCode());
        dto.setTripId(s.getTripId());
        dto.setArrivalTime(s.getArrivalTime());
        dto.setDepartureTime(s.getDepartureTime());
        dto.setStopSequence(s.getStopSequence());
        dto.setDirectionId(s.getDirectionId());
        dto.setServiceId(s.getServiceId());
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

        // Apagar horários desta importação
        scheduleRepository.deleteByImportId(importId);

        // Apagar na ordem inversa: segments → route_stops → routes → stops
        // Nota: Route tem cascade=ALL + orphanRemoval nos routeStops,
        // por isso apagamos segments antes e deixamos o cascade tratar dos route_stops.

        List<Long> routeIds = importEntityRepository.findEntityIdsByImportIdAndType(importId, "ROUTE");
        if (!routeIds.isEmpty())
        {
            for (Long rid : routeIds)
            {
                segmentRepository.deleteByRouteId(rid);
            }
            // Apagar rotas — o cascade ALL + orphanRemoval apaga route_stops automaticamente
            List<Route> routes = routeRepository.findAllById(routeIds);
            routeRepository.deleteAll(routes);
        }
        else
        {
            // Se não há rotas rastreadas, apagar segments e route_stops individualmente
            List<Long> segmentIds = importEntityRepository.findEntityIdsByImportIdAndType(importId, "SEGMENT");
            if (!segmentIds.isEmpty()) segmentRepository.deleteAllById(segmentIds);

            List<Long> routeStopIds = importEntityRepository.findEntityIdsByImportIdAndType(importId, "ROUTE_STOP");
            if (!routeStopIds.isEmpty()) routeStopRepository.deleteAllById(routeStopIds);
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

            Map<String, Long> stopIdMap = new HashMap<>(); // GTFS stop_id → DB id

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

            // 2. CONSTRUIR MAPA ROTA → PARAGENS + HORÁRIOS
            Map<String, List<String[]>> routeStopsMap = new HashMap<>(); // route_id → [(stop_id, sequence)]
            Map<String, String> routeShapeMap = new HashMap<>(); // route_id → shape_id
            // Todos os stop_times por rota (para guardar horários completos)
            // route_id → List of {trip_id, stop_id, arrival, departure, sequence, direction_id, service_id}
            Map<String, List<Map<String, String>>> allSchedules = new HashMap<>();
            Map<String, Map<String, String>> tripInfoMap = new HashMap<>(); // trip_id → {route_id, direction_id, service_id, shape_id}

            if (files.containsKey("trips.txt") && files.containsKey("stop_times.txt"))
            {
                List<Map<String, String>> trips = parseCsv(files.get("trips.txt"));
                List<Map<String, String>> stopTimes = parseCsv(files.get("stop_times.txt"));

                // Indexar todos os trips
                for (Map<String, String> trip : trips)
                {
                    Map<String, String> info = new HashMap<>();
                    info.put("route_id", trip.get("route_id"));
                    info.put("direction_id", trip.getOrDefault("direction_id", "0"));
                    info.put("service_id", trip.getOrDefault("service_id", ""));
                    info.put("shape_id", trip.getOrDefault("shape_id", "").trim());
                    tripInfoMap.put(trip.get("trip_id"), info);
                }

                // 1 trip por rota (direction_id=0 preferido) para route_stops
                Map<String, String> routeTrip = new LinkedHashMap<>(); // route_id → trip_id
                for (Map<String, String> trip : trips)
                {
                    String rid = trip.get("route_id");
                    String dir = trip.getOrDefault("direction_id", "0");
                    if (!routeTrip.containsKey(rid) && "0".equals(dir))
                    {
                        routeTrip.put(rid, trip.get("trip_id"));
                        String shapeId = trip.getOrDefault("shape_id", "").trim();
                        if (!shapeId.isEmpty()) routeShapeMap.put(rid, shapeId);
                    }
                }
                // Fallback para direction_id=1
                for (Map<String, String> trip : trips)
                {
                    String rid = trip.get("route_id");
                    if (!routeTrip.containsKey(rid))
                    {
                        routeTrip.put(rid, trip.get("trip_id"));
                        String shapeId = trip.getOrDefault("shape_id", "").trim();
                        if (!shapeId.isEmpty() && !routeShapeMap.containsKey(rid))
                            routeShapeMap.put(rid, shapeId);
                    }
                }

                Set<String> selectedTrips = new HashSet<>(routeTrip.values());
                Map<String, String> tripToRoute = new HashMap<>();
                routeTrip.forEach((rid, tid) -> tripToRoute.put(tid, rid));

                for (Map<String, String> st : stopTimes)
                {
                    String tid = st.get("trip_id");
                    Map<String, String> tInfo = tripInfoMap.get(tid);
                    if (tInfo == null) continue;
                    String rid = tInfo.get("route_id");

                    // Para route_stops (1 trip selecionado por rota)
                    if (selectedTrips.contains(tid))
                    {
                        routeStopsMap.computeIfAbsent(rid, k -> new ArrayList<>())
                                .add(new String[]{st.get("stop_id"), st.get("stop_sequence")});
                    }

                    // Para horários completos (todos os trips)
                    Map<String, String> sched = new HashMap<>();
                    sched.put("trip_id", tid);
                    sched.put("stop_id", st.get("stop_id"));
                    sched.put("arrival_time", st.getOrDefault("arrival_time", ""));
                    sched.put("departure_time", st.getOrDefault("departure_time", ""));
                    sched.put("stop_sequence", st.getOrDefault("stop_sequence", "0"));
                    sched.put("direction_id", tInfo.get("direction_id"));
                    sched.put("service_id", tInfo.get("service_id"));
                    allSchedules.computeIfAbsent(rid, k -> new ArrayList<>()).add(sched);
                }

                // Ordenar por sequence
                routeStopsMap.values().forEach(list ->
                        list.sort(Comparator.comparingInt(a -> Integer.parseInt(a[1]))));
            }

            // 3. CARREGAR SHAPES
            Map<String, List<List<Double>>> shapesMap = new HashMap<>();
            if (files.containsKey("shapes.txt"))
            {
                List<Map<String, String>> shapesRaw = parseCsv(files.get("shapes.txt"));
                log.info("[GTFS] #{}: {} pontos de shape encontrados", imp.getId(), shapesRaw.size());

                // Detectar nomes das colunas
                if (!shapesRaw.isEmpty())
                {
                    Map<String, String> sample = shapesRaw.get(0);
                    String latKey = sample.keySet().stream().filter(k -> k.toLowerCase().contains("lat")).findFirst().orElse("shape_pt_lat");
                    String lonKey = sample.keySet().stream().filter(k -> k.toLowerCase().contains("lon")).findFirst().orElse("shape_pt_lon");
                    String seqKey = sample.keySet().stream().filter(k -> k.toLowerCase().contains("sequence")).findFirst().orElse("shape_pt_sequence");

                    // Agrupar por shape_id
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
                                Integer.parseInt(p.getOrDefault(seqKey, "0").trim())));

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

            broadcastProgress(imp.getId(), "PROCESSING_ROUTES", "A importar rotas…", 60);

            // 4. CARREGAR ROTAS
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
                    colorIdx++;

                    Optional<Route> existing = routeRepository.findByCode(code);
                    Route entity = existing.orElse(new Route());
                    boolean isNew = entity.getId() == null;

                    entity.setName(name);
                    entity.setCode(code);
                    entity.setColor(color);

                    // Se existente, limpar stops antigos
                    if (!isNew)
                    {
                        routeStopRepository.deleteByRouteId(entity.getId());
                        segmentRepository.deleteByRouteId(entity.getId());
                        scheduleRepository.deleteByRouteId(entity.getId());
                    }

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

                    // Associar paragens à rota
                    List<String[]> stopsList = routeStopsMap.get(gtfsRouteId);
                    if (stopsList != null)
                    {
                        for (String[] pair : stopsList)
                        {
                            Long stopDbId = stopIdMap.get(pair[0]);
                            if (stopDbId == null) continue;

                            Optional<BusStop> stopOpt = busStopRepository.findById(stopDbId);
                            if (stopOpt.isEmpty()) continue;

                            RouteStop rs = new RouteStop();
                            rs.setRoute(saved);
                            rs.setStop(stopOpt.get());
                            rs.setStopOrder(Integer.parseInt(pair[1]));
                            RouteStop savedRs = routeStopRepository.save(rs);

                            if (isNew)
                                importEntityRepository.save(new GtfsImportEntity(imp, "ROUTE_STOP", savedRs.getId()));
                        }
                    }

                    // Guardar horários (stop_schedule) para esta rota
                    // Sprint 0 (F4 follow-up): batch de 100 com flush() entre chunks
                    // para reduzir tempo da conexão aberta (HikariCP leak detection).
                    List<Map<String, String>> schedList = allSchedules.get(gtfsRouteId);
                    int schedulesCreated = 0;
                    if (schedList != null)
                    {
                        final int BATCH_SIZE = 100;
                        List<StopSchedule> batch = new ArrayList<>(BATCH_SIZE);
                        for (Map<String, String> sc : schedList)
                        {
                            Long stopDbId = stopIdMap.get(sc.get("stop_id"));
                            if (stopDbId == null) continue;
                            Optional<BusStop> stopOpt = busStopRepository.findById(stopDbId);
                            if (stopOpt.isEmpty()) continue;

                            String arrival = sc.getOrDefault("arrival_time", "").trim();
                            String departure = sc.getOrDefault("departure_time", "").trim();
                            if (arrival.isEmpty() && departure.isEmpty()) continue;

                            StopSchedule ss = new StopSchedule();
                            ss.setRoute(saved);
                            ss.setStop(stopOpt.get());
                            ss.setTripId(sc.get("trip_id"));
                            ss.setArrivalTime(arrival.isEmpty() ? departure : arrival);
                            ss.setDepartureTime(departure.isEmpty() ? arrival : departure);
                            ss.setStopSequence(Integer.parseInt(sc.getOrDefault("stop_sequence", "0")));
                            ss.setDirectionId(Integer.parseInt(sc.getOrDefault("direction_id", "0")));
                            ss.setServiceId(sc.getOrDefault("service_id", ""));
                            ss.setGtfsImport(imp);
                            batch.add(ss);
                            if (batch.size() >= BATCH_SIZE)
                            {
                                scheduleRepository.saveAll(batch);
                                scheduleRepository.flush();
                                schedulesCreated += batch.size();
                                batch.clear();
                            }
                        }
                        if (!batch.isEmpty())
                        {
                            scheduleRepository.saveAll(batch);
                            scheduleRepository.flush();
                            schedulesCreated += batch.size();
                            batch.clear();
                        }
                    }
                    if (schedulesCreated == 0)
                        log.warn("[GTFS] #{}: Rota {} importada SEM horários (stop_times em falta)",
                                imp.getId(), code);
                    else
                        log.info("[GTFS] #{}: Rota {} — {} horários guardados",
                                imp.getId(), code, schedulesCreated);

                    // Guardar shape GTFS se disponível
                    String shapeId = routeShapeMap.get(gtfsRouteId);
                    if (shapeId != null && shapesMap.containsKey(shapeId))
                    {
                        try
                        {
                            List<RouteStop> orderedStops = routeStopRepository.findAll().stream()
                                    .filter(rs -> rs.getRoute().getId().equals(saved.getId()))
                                    .sorted(Comparator.comparingInt(RouteStop::getStopOrder))
                                    .toList();
                            int lastOrder = orderedStops.isEmpty() ? 1
                                    : orderedStops.get(orderedStops.size() - 1).getStopOrder();

                            RouteSegment seg = new RouteSegment();
                            seg.setRoute(saved);
                            seg.setFromStopOrder(1);
                            seg.setToStopOrder(lastOrder);
                            seg.setPoints(objectMapper.writeValueAsString(shapesMap.get(shapeId)));

                            RouteSegment savedSeg = segmentRepository.save(seg);
                            if (isNew)
                                importEntityRepository.save(new GtfsImportEntity(imp, "SEGMENT", savedSeg.getId()));
                        }
                        catch (Exception e)
                        {
                            log.warn("[GTFS] #{}: Erro ao guardar shape para rota {}: {}",
                                    imp.getId(), code, e.getMessage());
                        }
                    }
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

            log.info("[GTFS] #{}: Importação concluída — {} paragens (+{}upd), {} rotas (+{}upd), {} shapes",
                    imp.getId(), stopsCreated, stopsUpdated, routesCreated, routesUpdated, shapesLoaded);
        }
        catch (Exception e)
        {
            failImport(imp, e);
            throw new RuntimeException("Falha no processamento GTFS", e);
        }
    }

    // ================================================================
    // UTILITÁRIOS
    // ================================================================

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
                    // Extrair nome do ficheiro se estiver em subdiretoria
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
        dto.setSchedulesLoaded(scheduleRepository.countByImportId(entity.getId()));
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
