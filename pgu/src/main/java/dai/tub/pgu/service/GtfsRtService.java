package dai.tub.pgu.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import com.google.transit.realtime.GtfsRealtime.FeedEntity;
import com.google.transit.realtime.GtfsRealtime.FeedHeader;
import com.google.transit.realtime.GtfsRealtime.FeedMessage;
import com.google.transit.realtime.GtfsRealtime.Position;
import com.google.transit.realtime.GtfsRealtime.TripDescriptor;
import com.google.transit.realtime.GtfsRealtime.TripUpdate;
import com.google.transit.realtime.GtfsRealtime.TripUpdate.StopTimeEvent;
import com.google.transit.realtime.GtfsRealtime.TripUpdate.StopTimeUpdate;
import com.google.transit.realtime.GtfsRealtime.VehicleDescriptor;
import com.google.transit.realtime.GtfsRealtime.VehiclePosition;

/**
 * Sprint 1 (F7): construcao dos feeds GTFS-Realtime (R.IVT.01/04/07).
 *
 * <p>Produz duas {@link FeedMessage} protobuf consumiveis por apps externas
 * (Google Maps, Transit, Citymapper):
 * <ul>
 *   <li><b>VehiclePositions</b>: uma posicao por autocarro com telemetria
 *       recente (ultimos 5 min), a partir da ultima leitura de cada bus.</li>
 *   <li><b>TripUpdates</b>: melhor-esforco. O runtime ainda NAO associa um
 *       autocarro vivo a uma trip concreta (o block_id dos buses so e'
 *       populado na Fase 4), por isso derivamos as trip updates do horario
 *       planeado para hoje (trip + trip_stop_time + service_calendar),
 *       restringido as rotas com autocarros activos, e aplicamos um atraso
 *       ao nivel da rota inferido do estado da telemetria.</li>
 * </ul>
 *
 * <p>Identificadores GTFS reais: {@code route_id} = routes.code,
 * {@code trip_id} = trip.gtfs_trip_id, {@code stop_id} = bus_stops.code.
 * Sao os codigos GTFS publicos, nao as PKs internas.
 *
 * <p>Cache: 30s por feed (caches "gtfs-rt-vp" / "gtfs-rt-tu" registadas em
 * {@code CacheConfig}). O controller acrescenta Cache-Control: max-age=30.
 */
@Service
public class GtfsRtService
{
    private static final Logger log = LoggerFactory.getLogger(GtfsRtService.class);

    private static final String GTFS_RT_VERSION = "2.0";
    private static final ZoneId ZONE = ZoneId.of("Europe/Lisbon");

    /** Janela de telemetria considerada "activa" para um autocarro. */
    private static final int ACTIVE_WINDOW_MINUTES = 5;

    /**
     * Atraso (segundos) atribuido a uma rota cujos autocarros activos reportam
     * estado 'delayed'. Estimativa grosseira ao nivel da rota enquanto nao ha
     * associacao bus->trip em runtime. 180s = 3 min.
     */
    private static final int DELAYED_ROUTE_SECONDS = 180;

    /** Nao incluir trips cuja ultima paragem ja passou ha mais de isto (min). */
    private static final int TRIP_LOOKBACK_MINUTES = 30;

    // Sprint 1 (F9): nome da DataSource monitorizada deste publicador
    // (seed em V44__observability_data_sources.sql). Pulse a cada geracao OK.
    private static final String DS_NAME = "GTFS-RT publisher";

    // Sprint 1 (F9): valores das tags Micrometer (feed=...) por tipo de feed.
    private static final String FEED_VEHICLE_POSITIONS = "vehicle-positions";
    private static final String FEED_TRIP_UPDATES = "trip-updates";

    private final JdbcTemplate jdbc;

    // Sprint 1 (F9): observabilidade. MeterRegistry e' auto-configurado pelo
    // Spring Boot (micrometer-registry-prometheus, Sprint 0 F2). O
    // DataSourceHealthService recebe os pulses internos por nome.
    private final MeterRegistry meterRegistry;
    private final DataSourceHealthService healthService;

    // Timers de geracao por feed e counters de pedidos por feed.
    private final Timer vpDurationTimer;
    private final Timer tuDurationTimer;
    private final Counter vpRequestsCounter;
    private final Counter tuRequestsCounter;

    public GtfsRtService(JdbcTemplate jdbc,
                         MeterRegistry meterRegistry,
                         DataSourceHealthService healthService)
    {
        this.jdbc = jdbc;
        this.meterRegistry = meterRegistry;
        this.healthService = healthService;

        this.vpDurationTimer = Timer.builder("gtfs_rt.generation.duration")
                .description("Tempo de construcao de um feed GTFS-Realtime")
                .tag("feed", FEED_VEHICLE_POSITIONS)
                .register(meterRegistry);
        this.tuDurationTimer = Timer.builder("gtfs_rt.generation.duration")
                .description("Tempo de construcao de um feed GTFS-Realtime")
                .tag("feed", FEED_TRIP_UPDATES)
                .register(meterRegistry);
        this.vpRequestsCounter = Counter.builder("gtfs_rt.requests")
                .description("Numero de pedidos de geracao de feeds GTFS-Realtime")
                .tag("feed", FEED_VEHICLE_POSITIONS)
                .register(meterRegistry);
        this.tuRequestsCounter = Counter.builder("gtfs_rt.requests")
                .description("Numero de pedidos de geracao de feeds GTFS-Realtime")
                .tag("feed", FEED_TRIP_UPDATES)
                .register(meterRegistry);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  VehiclePositions
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Constroi o feed de posicoes de veiculos: ultima leitura de cada autocarro
     * com telemetria nos ultimos {@value #ACTIVE_WINDOW_MINUTES} minutos.
     */
    @Cacheable("gtfs-rt-vp")
    public FeedMessage buildVehiclePositions()
    {
        // Sprint 1 (F9): conta o pedido e cronometra a construcao deste feed.
        vpRequestsCounter.increment();
        FeedMessage result = vpDurationTimer.record(this::buildVehiclePositionsInternal);
        pulse(DS_NAME, "VehiclePositions: " + result.getEntityCount() + " entidades");
        return result;
    }

    private FeedMessage buildVehiclePositionsInternal()
    {
        long now = Instant.now().getEpochSecond();
        FeedMessage.Builder feed = FeedMessage.newBuilder()
                .setHeader(header(now));

        // DISTINCT ON (bus_id) ... ORDER BY bus_id, recorded_at DESC => ultima
        // leitura por autocarro. ST_Y = latitude, ST_X = longitude (SRID 4326).
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT DISTINCT ON (vt.bus_id) "
            + "  vt.bus_id                    AS bus_id, "
            + "  ST_Y(vt.location)            AS lat, "
            + "  ST_X(vt.location)            AS lon, "
            + "  vt.speed_kmh                 AS speed_kmh, "
            + "  vt.recorded_at               AS recorded_at, "
            + "  r.code                       AS route_code "
            + "FROM vehicle_telemetry vt "
            + "LEFT JOIN buses  b ON b.bus_code = vt.bus_id "
            + "LEFT JOIN routes r ON r.id       = b.route_id "
            + "WHERE vt.recorded_at >= NOW() - (? * INTERVAL '1 minute') "
            + "ORDER BY vt.bus_id, vt.recorded_at DESC",
            ACTIVE_WINDOW_MINUTES);

        for (Map<String, Object> row : rows)
        {
            String busId     = asString(row.get("bus_id"));
            Double lat       = asDouble(row.get("lat"));
            Double lon       = asDouble(row.get("lon"));
            if (busId == null || lat == null || lon == null) continue;

            Double speedKmh  = asDouble(row.get("speed_kmh"));
            String routeCode = asString(row.get("route_code"));
            long ts          = epochSeconds(row.get("recorded_at"), now);

            Position.Builder pos = Position.newBuilder()
                    .setLatitude(lat.floatValue())
                    .setLongitude(lon.floatValue());
            if (speedKmh != null)
            {
                // GTFS-RT Position.speed e' em metros/segundo; telemetria em km/h.
                pos.setSpeed((float) (speedKmh / 3.6));
            }

            VehiclePosition.Builder vp = VehiclePosition.newBuilder()
                    .setPosition(pos)
                    .setTimestamp(ts)
                    .setVehicle(VehicleDescriptor.newBuilder()
                            .setId(busId)
                            .setLabel(busId));

            // Sem associacao bus->trip em runtime: damos pelo menos a rota.
            if (routeCode != null && !routeCode.isBlank())
            {
                vp.setTrip(TripDescriptor.newBuilder().setRouteId(routeCode));
            }

            feed.addEntity(FeedEntity.newBuilder()
                    .setId("vehicle-" + busId)
                    .setVehicle(vp));
        }

        log.debug("GTFS-RT VehiclePositions: {} entidades", feed.getEntityCount());
        return feed.build();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  TripUpdates (melhor-esforco)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Constroi o feed de trip updates a partir do horario planeado para hoje,
     * restringido as rotas com autocarros activos, com atraso estimado ao nivel
     * da rota. Ver nota de classe sobre a limitacao da associacao bus->trip.
     */
    @Cacheable("gtfs-rt-tu")
    public FeedMessage buildTripUpdates()
    {
        // Sprint 1 (F9): conta o pedido e cronometra a construcao deste feed.
        tuRequestsCounter.increment();
        FeedMessage result = tuDurationTimer.record(this::buildTripUpdatesInternal);
        pulse(DS_NAME, "TripUpdates: " + result.getEntityCount() + " entidades");
        return result;
    }

    private FeedMessage buildTripUpdatesInternal()
    {
        long now = Instant.now().getEpochSecond();
        FeedMessage.Builder feed = FeedMessage.newBuilder()
                .setHeader(header(now));

        LocalDate today = LocalDate.now(ZONE);
        String dowColumn = dayOfWeekColumn(today);

        // Atraso por rota (route.code -> segundos), inferido da telemetria:
        // se algum autocarro activo da rota esta 'delayed', assume-se atraso.
        Map<String, Integer> routeDelays = routeDelaySeconds();
        if (routeDelays.isEmpty())
        {
            // Sem rotas activas => feed vazio mas valido.
            return feed.build();
        }

        // Trips de hoje das rotas activas: junta trip -> route (code) e filtra
        // pelo service_calendar (dia da semana + intervalo de datas). Limita as
        // trips ainda relevantes (ultima chegada nao demasiado no passado).
        // O LIMIT protege o feed de explodir com horarios enormes.
        //
        // IN (...) com placeholders gerados em vez de = ANY(?): passar um
        // String[] pelo JdbcTemplate nao e' convertido de forma fiavel num
        // array SQL pelo driver pg. As keys sao route.codes que nos controlamos.
        List<String> activeRouteCodes = new java.util.ArrayList<>(routeDelays.keySet());
        String inPlaceholders = String.join(",", java.util.Collections.nCopies(activeRouteCodes.size(), "?"));
        String nowTime = LocalTime.now(ZONE).toString(); // HH:MM ou HH:MM:SS
        String lookbackTime = minusMinutes(nowTime, TRIP_LOOKBACK_MINUTES);

        java.util.List<Object> args = new java.util.ArrayList<>(activeRouteCodes);
        args.add(today.toString());      // start_date cast
        args.add(today.toString());      // end_date cast
        args.add(lookbackTime);          // last_arrival lower bound

        List<Map<String, Object>> trips = jdbc.queryForList(
            "SELECT t.id                 AS trip_pk, "
            + "       t.gtfs_trip_id      AS gtfs_trip_id, "
            + "       r.code              AS route_code, "
            + "       agg.last_arrival    AS last_arrival "
            + "FROM trip t "
            + "JOIN routes r ON r.id = t.route_id "
            + "JOIN service_calendar sc ON sc.service_id = t.service_id "
            + "JOIN ( "
            + "   SELECT trip_id, MAX(arrival_time) AS last_arrival "
            + "   FROM trip_stop_time GROUP BY trip_id "
            + ") agg ON agg.trip_id = t.id "
            + "WHERE r.code IN (" + inPlaceholders + ") "
            + "  AND sc." + dowColumn + " = TRUE "
            + "  AND (sc.start_date IS NULL OR sc.start_date <= CAST(? AS date)) "
            + "  AND (sc.end_date   IS NULL OR sc.end_date   >= CAST(? AS date)) "
            // ainda relevante: ultima chegada >= agora - lookback (comparacao lexicografica HH:MM:SS)
            + "  AND agg.last_arrival >= ? "
            + "ORDER BY r.code, agg.last_arrival "
            + "LIMIT 500",
            args.toArray());

        for (Map<String, Object> trip : trips)
        {
            Long tripPk      = asLong(trip.get("trip_pk"));
            String gtfsTripId = asString(trip.get("gtfs_trip_id"));
            String routeCode  = asString(trip.get("route_code"));
            if (tripPk == null || gtfsTripId == null || routeCode == null) continue;

            int delaySec = routeDelays.getOrDefault(routeCode, 0);

            TripUpdate.Builder tu = TripUpdate.newBuilder()
                    .setTimestamp(now)
                    .setDelay(delaySec)
                    .setTrip(TripDescriptor.newBuilder()
                            .setTripId(gtfsTripId)
                            .setRouteId(routeCode));

            // StopTimeUpdate por paragem da trip: stop_id = codigo GTFS da paragem,
            // arrival = hora planeada + atraso da rota.
            List<Map<String, Object>> stops = jdbc.queryForList(
                "SELECT tst.stop_sequence AS stop_sequence, "
                + "     bs.code           AS stop_code, "
                + "     tst.arrival_time  AS arrival_time, "
                + "     tst.departure_time AS departure_time "
                + "FROM trip_stop_time tst "
                + "JOIN bus_stops bs ON bs.id = tst.stop_id "
                + "WHERE tst.trip_id = ? "
                + "ORDER BY tst.stop_sequence",
                tripPk);

            for (Map<String, Object> st : stops)
            {
                String stopCode = asString(st.get("stop_code"));
                Integer seq     = asInteger(st.get("stop_sequence"));
                if (stopCode == null || seq == null) continue;

                Long arrEpoch = scheduledEpoch(asString(st.get("arrival_time")), today, delaySec);
                Long depEpoch = scheduledEpoch(asString(st.get("departure_time")), today, delaySec);

                StopTimeUpdate.Builder stu = StopTimeUpdate.newBuilder()
                        .setStopSequence(seq)
                        .setStopId(stopCode);

                if (arrEpoch != null)
                {
                    stu.setArrival(StopTimeEvent.newBuilder()
                            .setDelay(delaySec)
                            .setTime(arrEpoch));
                }
                if (depEpoch != null)
                {
                    stu.setDeparture(StopTimeEvent.newBuilder()
                            .setDelay(delaySec)
                            .setTime(depEpoch));
                }
                tu.addStopTimeUpdate(stu);
            }

            feed.addEntity(FeedEntity.newBuilder()
                    .setId("trip-" + gtfsTripId)
                    .setTripUpdate(tu));
        }

        log.debug("GTFS-RT TripUpdates: {} entidades", feed.getEntityCount());
        return feed.build();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Sprint 1 (F9): regista um pulse de saude para a DataSource deste
     * publicador apos uma geracao bem sucedida. Best-effort: o
     * {@link DataSourceHealthService#recordPulseByName} ja' engole excecoes,
     * mas embrulhamos na mesma para garantir que nenhuma falha de bookkeeping
     * parte a resposta do feed.
     */
    private void pulse(String dataSourceName, String detalhes)
    {
        try
        {
            healthService.recordPulseByName(dataSourceName, detalhes);
        }
        catch (Exception ex)
        {
            log.warn("GTFS-RT: falha a registar pulse para '{}': {}", dataSourceName, ex.getMessage());
        }
    }

    private static FeedHeader header(long epochSeconds)
    {
        return FeedHeader.newBuilder()
                .setGtfsRealtimeVersion(GTFS_RT_VERSION)
                .setIncrementality(FeedHeader.Incrementality.FULL_DATASET)
                .setTimestamp(epochSeconds)
                .build();
    }

    /**
     * Mapa route.code -> atraso estimado (segundos) das rotas com autocarros
     * activos. Uma rota conta como atrasada se >=1 autocarro activo reporta
     * estado 'delayed' na sua ultima leitura.
     */
    private Map<String, Integer> routeDelaySeconds()
    {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "WITH latest AS ( "
            + "  SELECT DISTINCT ON (vt.bus_id) vt.bus_id, vt.status, b.route_id "
            + "  FROM vehicle_telemetry vt "
            + "  JOIN buses b ON b.bus_code = vt.bus_id "
            + "  WHERE vt.recorded_at >= NOW() - (? * INTERVAL '1 minute') "
            + "  ORDER BY vt.bus_id, vt.recorded_at DESC "
            + ") "
            + "SELECT r.code AS route_code, "
            + "       BOOL_OR(LOWER(latest.status) = 'delayed') AS any_delayed "
            + "FROM latest "
            + "JOIN routes r ON r.id = latest.route_id "
            + "GROUP BY r.code",
            ACTIVE_WINDOW_MINUTES);

        java.util.HashMap<String, Integer> out = new java.util.HashMap<>();
        for (Map<String, Object> row : rows)
        {
            String routeCode = asString(row.get("route_code"));
            if (routeCode == null) continue;
            boolean delayed = Boolean.TRUE.equals(row.get("any_delayed"));
            out.put(routeCode, delayed ? DELAYED_ROUTE_SECONDS : 0);
        }
        return out;
    }

    /** Coluna do service_calendar para o dia da semana da data dada. */
    private static String dayOfWeekColumn(LocalDate date)
    {
        switch (date.getDayOfWeek())
        {
            case MONDAY:    return "monday";
            case TUESDAY:   return "tuesday";
            case WEDNESDAY: return "wednesday";
            case THURSDAY:  return "thursday";
            case FRIDAY:    return "friday";
            case SATURDAY:  return "saturday";
            default:        return "sunday";
        }
    }

    /**
     * Converte uma hora GTFS "HH:MM:SS" (que pode passar das 24h) na data dada
     * num epoch em segundos, aplicando o atraso. Horas >= 24 transbordam para o
     * dia seguinte (semantica GTFS). Devolve null se nao parseavel.
     */
    private static Long scheduledEpoch(String hhmmss, LocalDate serviceDate, int delaySeconds)
    {
        if (hhmmss == null || hhmmss.isBlank()) return null;
        String[] parts = hhmmss.split(":");
        if (parts.length < 2) return null;
        try
        {
            int h = Integer.parseInt(parts[0].trim());
            int m = Integer.parseInt(parts[1].trim());
            int s = parts.length >= 3 ? Integer.parseInt(parts[2].trim()) : 0;
            long secondsIntoDay = (long) h * 3600 + (long) m * 60 + s;
            Instant base = serviceDate.atStartOfDay(ZONE).toInstant();
            return base.plusSeconds(secondsIntoDay + delaySeconds).getEpochSecond();
        }
        catch (NumberFormatException ex)
        {
            return null;
        }
    }

    /** Subtrai minutos a uma hora "HH:MM[:SS]" devolvendo "HH:MM:SS" (sem rollover negativo). */
    private static String minusMinutes(String hhmmss, int minutes)
    {
        try
        {
            String[] p = (hhmmss == null ? "" : hhmmss).split(":");
            int h = p.length > 0 && !p[0].isEmpty() ? Integer.parseInt(p[0]) : 0;
            int m = p.length > 1 ? Integer.parseInt(p[1]) : 0;
            int s = p.length > 2 ? Integer.parseInt(p[2].substring(0, Math.min(2, p[2].length()))) : 0;
            int total = Math.max(0, h * 3600 + m * 60 + s - minutes * 60);
            int hh = total / 3600;
            int mm = (total % 3600) / 60;
            int ss = total % 60;
            return String.format("%02d:%02d:%02d", hh, mm, ss);
        }
        catch (Exception ex)
        {
            return "00:00:00";
        }
    }

    private static long epochSeconds(Object recordedAt, long fallback)
    {
        if (recordedAt instanceof java.sql.Timestamp ts) return ts.toInstant().getEpochSecond();
        if (recordedAt instanceof Instant in)            return in.getEpochSecond();
        if (recordedAt instanceof java.time.OffsetDateTime odt) return odt.toInstant().getEpochSecond();
        return fallback;
    }

    private static String asString(Object o)  { return o == null ? null : o.toString(); }
    private static Long   asLong(Object o)    { return o instanceof Number n ? n.longValue() : null; }
    private static Integer asInteger(Object o){ return o instanceof Number n ? n.intValue()  : null; }
    private static Double asDouble(Object o)  { return o instanceof Number n ? n.doubleValue(): null; }
}
