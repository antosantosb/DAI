package dai.tub.pgu.service;

import java.io.ByteArrayOutputStream;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.xml.stream.XMLOutputFactory;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamWriter;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import dai.tub.pgu.domain.BusStop;
import dai.tub.pgu.domain.JourneyPattern;
import dai.tub.pgu.domain.Operator;
import dai.tub.pgu.domain.PatternStop;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.domain.Trip;
import dai.tub.pgu.domain.TripStopTime;
import dai.tub.pgu.repository.BusStopRepository;
import dai.tub.pgu.repository.JourneyPatternRepository;
import dai.tub.pgu.repository.OperatorRepository;
import dai.tub.pgu.repository.PatternStopRepository;
import dai.tub.pgu.repository.RouteRepository;
import dai.tub.pgu.repository.TripRepository;
import dai.tub.pgu.repository.TripStopTimeRepository;

/**
 * Sprint 1 (F8): export da rede como documento NeTEx PublicationDelivery
 * (R.IVT.02 / R.IVT.08 / R.IVT.11).
 *
 * <p>NeTEx (CEN/TS 16614, "Network Timetable Exchange") e' o standard europeu
 * de intercambio de dados de transporte publico, alinhado com o Transmodel.
 * Este servico produz um subconjunto essencial mas coerente: Operators,
 * StopPlaces/Quays, Lines, ScheduledStopPoints, JourneyPatterns e
 * ServiceJourneys com TimetabledPassingTimes e DayTypes.
 *
 * <p>Decisao de implementacao: o XML e' gerado com o {@code XMLStreamWriter}
 * do JDK (modulo java.xml), sem qualquer dependencia JAXB/NeTEx adicional.
 * Isto mantem o build limpo (zero alteracoes ao pom) e sem risco de versoes.
 *
 * <p>Os ids NeTEx reutilizam os codigos publicos estaveis (stop code, route
 * code, gtfs_trip_id), na forma convencional {@code TUB:Tipo:codigo}, para
 * que sejam estaveis entre exports e nao exponham PKs internas da BD. Cada
 * elemento *Ref aponta sempre para um id efetivamente emitido neste documento.
 */
@Service
public class NeTExExportService
{
    // Prefixo/codigo do data source NeTEx. Por convencao usa-se o codigo do
    // operador principal (a rede e' a TUB).
    private static final String CODESPACE = "TUB";

    private static final String NETEX_NS = "http://www.netex.org.uk/netex";
    private static final String GML_NS   = "http://www.opengis.net/gml/3.2";
    private static final String NETEX_VERSION = "1.0";

    // Sprint 1 (F9): nome da DataSource monitorizada deste exportador
    // (seed em V44__observability_data_sources.sql). Pulse a cada export OK.
    private static final String DS_NAME = "NeTEx exporter";

    private final OperatorRepository operatorRepo;
    private final BusStopRepository busStopRepo;
    private final RouteRepository routeRepo;
    private final JourneyPatternRepository patternRepo;
    private final PatternStopRepository patternStopRepo;
    private final TripRepository tripRepo;
    private final TripStopTimeRepository tripStopTimeRepo;
    private final JdbcTemplate jdbcTemplate;

    // Sprint 1 (F9): observabilidade. MeterRegistry auto-configurado pelo Spring
    // Boot (micrometer-registry-prometheus). Pulses internos por nome via
    // DataSourceHealthService.
    private final DataSourceHealthService healthService;
    private final Timer exportDurationTimer;

    public NeTExExportService(OperatorRepository operatorRepo,
                              BusStopRepository busStopRepo,
                              RouteRepository routeRepo,
                              JourneyPatternRepository patternRepo,
                              PatternStopRepository patternStopRepo,
                              TripRepository tripRepo,
                              TripStopTimeRepository tripStopTimeRepo,
                              JdbcTemplate jdbcTemplate,
                              MeterRegistry meterRegistry,
                              DataSourceHealthService healthService)
    {
        this.operatorRepo = operatorRepo;
        this.busStopRepo = busStopRepo;
        this.routeRepo = routeRepo;
        this.patternRepo = patternRepo;
        this.patternStopRepo = patternStopRepo;
        this.tripRepo = tripRepo;
        this.tripStopTimeRepo = tripStopTimeRepo;
        this.jdbcTemplate = jdbcTemplate;
        this.healthService = healthService;
        this.exportDurationTimer = Timer.builder("netex.export.duration")
                .description("Tempo de geracao do documento NeTEx PublicationDelivery")
                .register(meterRegistry);
    }

    /**
     * Constroi o documento NeTEx completo e devolve-o como bytes UTF-8.
     *
     * <p>Transacional read-only: as relacoes LAZY (pattern -> route, trip ->
     * pattern) sao navegadas dentro da mesma sessao para evitar
     * LazyInitializationException ao gerar o XML.
     */
    @Transactional(readOnly = true)
    public byte[] exportNetwork()
    {
        // Sprint 1 (F9): cronometra a geracao do documento. Em caso de falha o
        // Timer.record reproduz a excecao (sem pulse). So' regista pulse de
        // saude quando o export termina com sucesso.
        byte[] xml = exportDurationTimer.record(this::buildDocumentBytes);
        pulse(DS_NAME, "NeTEx export: " + (xml == null ? 0 : xml.length) + " bytes");
        return xml;
    }

    private byte[] buildDocumentBytes()
    {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        XMLOutputFactory factory = XMLOutputFactory.newInstance();
        XMLStreamWriter w = null;
        try
        {
            w = factory.createXMLStreamWriter(out, "UTF-8");
            writeDocument(w);
            w.flush();
        }
        catch (XMLStreamException e)
        {
            throw new IllegalStateException("Falha a gerar o documento NeTEx", e);
        }
        finally
        {
            if (w != null)
            {
                try { w.close(); } catch (XMLStreamException ignored) { /* best effort */ }
            }
        }
        return out.toByteArray();
    }

    /**
     * Sprint 1 (F9): pulse de saude best-effort apos um export bem sucedido.
     * Nunca propaga: uma falha de bookkeeping nao deve partir o export.
     */
    private void pulse(String dataSourceName, String detalhes)
    {
        try
        {
            healthService.recordPulseByName(dataSourceName, detalhes);
        }
        catch (Exception ignored)
        {
            // best effort: ja' logado dentro do health service
        }
    }

    // ------------------------------------------------------------------
    // Estrutura do documento
    // ------------------------------------------------------------------

    private void writeDocument(XMLStreamWriter w) throws XMLStreamException
    {
        w.writeStartDocument("UTF-8", "1.0");

        w.writeStartElement("PublicationDelivery");
        w.writeDefaultNamespace(NETEX_NS);
        w.writeNamespace("gml", GML_NS);
        w.writeAttribute("version", NETEX_VERSION);

        writeText(w, "PublicationTimestamp", OffsetDateTime.now().toString());
        writeText(w, "ParticipantRef", CODESPACE);

        w.writeStartElement("dataObjects");
        w.writeStartElement("CompositeFrame");
        w.writeAttribute("version", NETEX_VERSION);
        w.writeAttribute("id", frameId("CompositeFrame", "network"));

        w.writeStartElement("frames");
        writeResourceFrame(w);
        writeSiteFrame(w);
        writeServiceFrame(w);
        writeTimetableFrame(w);
        w.writeEndElement(); // frames

        w.writeEndElement(); // CompositeFrame
        w.writeEndElement(); // dataObjects
        w.writeEndElement(); // PublicationDelivery
        w.writeEndDocument();
    }

    // ------------------------------------------------------------------
    // ResourceFrame: Operators
    // ------------------------------------------------------------------

    private void writeResourceFrame(XMLStreamWriter w) throws XMLStreamException
    {
        List<Operator> operators = operatorRepo.findAll();

        w.writeStartElement("ResourceFrame");
        w.writeAttribute("version", NETEX_VERSION);
        w.writeAttribute("id", frameId("ResourceFrame", "operators"));

        w.writeStartElement("organisations");
        for (Operator op : operators)
        {
            w.writeStartElement("Operator");
            w.writeAttribute("version", NETEX_VERSION);
            w.writeAttribute("id", id("Operator", op.getCode()));

            writeText(w, "Name", op.getName());
            if (op.getTaxId() != null && !op.getTaxId().isBlank())
            {
                writeText(w, "CompanyNumber", op.getTaxId());
            }
            if (op.getContactEmail() != null && !op.getContactEmail().isBlank())
            {
                w.writeStartElement("ContactDetails");
                writeText(w, "Email", op.getContactEmail());
                w.writeEndElement(); // ContactDetails
            }
            // PublicCode: o codigo curto/estavel do operador (ex.: TUB).
            writeText(w, "PublicCode", op.getCode());

            w.writeEndElement(); // Operator
        }
        w.writeEndElement(); // organisations

        w.writeEndElement(); // ResourceFrame
    }

    // ------------------------------------------------------------------
    // SiteFrame: StopPlace + Quay por paragem
    // ------------------------------------------------------------------

    private void writeSiteFrame(XMLStreamWriter w) throws XMLStreamException
    {
        List<BusStop> stops = busStopRepo.findAll();

        w.writeStartElement("SiteFrame");
        w.writeAttribute("version", NETEX_VERSION);
        w.writeAttribute("id", frameId("SiteFrame", "stops"));

        w.writeStartElement("stopPlaces");
        for (BusStop stop : stops)
        {
            Double lat = latitudeOf(stop);
            Double lon = longitudeOf(stop);

            w.writeStartElement("StopPlace");
            w.writeAttribute("version", NETEX_VERSION);
            w.writeAttribute("id", id("StopPlace", stop.getCode()));

            writeText(w, "Name", stop.getName());
            writeCentroid(w, lat, lon);

            // Quay: o ponto fisico de embarque dentro do StopPlace.
            w.writeStartElement("quays");
            w.writeStartElement("Quay");
            w.writeAttribute("version", NETEX_VERSION);
            w.writeAttribute("id", id("Quay", stop.getCode()));
            writeText(w, "Name", stop.getName());
            writeText(w, "PublicCode", stop.getCode());
            writeCentroid(w, lat, lon);
            w.writeEndElement(); // Quay
            w.writeEndElement(); // quays

            w.writeEndElement(); // StopPlace
        }
        w.writeEndElement(); // stopPlaces

        w.writeEndElement(); // SiteFrame
    }

    // ------------------------------------------------------------------
    // ServiceFrame: Lines, ScheduledStopPoints, JourneyPatterns
    // ------------------------------------------------------------------

    private void writeServiceFrame(XMLStreamWriter w) throws XMLStreamException
    {
        List<Route> routes = routeRepo.findAll();
        List<BusStop> stops = busStopRepo.findAll();

        w.writeStartElement("ServiceFrame");
        w.writeAttribute("version", NETEX_VERSION);
        w.writeAttribute("id", frameId("ServiceFrame", "network"));

        // --- Lines ---
        w.writeStartElement("lines");
        for (Route route : routes)
        {
            w.writeStartElement("Line");
            w.writeAttribute("version", NETEX_VERSION);
            w.writeAttribute("id", id("Line", route.getCode()));

            writeText(w, "Name", route.getName());
            writeText(w, "PublicCode", route.getCode());
            if (route.getColor() != null && !route.getColor().isBlank())
            {
                // NeTEx espera a cor em hex sem '#'.
                writeText(w, "Colour", stripHash(route.getColor()));
            }
            writeText(w, "TransportMode", "bus");
            if (route.getOperator() != null && route.getOperator().getCode() != null)
            {
                writeRef(w, "OperatorRef", id("Operator", route.getOperator().getCode()));
            }

            w.writeEndElement(); // Line
        }
        w.writeEndElement(); // lines

        // --- ScheduledStopPoints (um por paragem; referenciados pelos padroes) ---
        w.writeStartElement("scheduledStopPoints");
        for (BusStop stop : stops)
        {
            w.writeStartElement("ScheduledStopPoint");
            w.writeAttribute("version", NETEX_VERSION);
            w.writeAttribute("id", id("ScheduledStopPoint", stop.getCode()));
            writeText(w, "Name", stop.getName());
            writeCentroid(w, latitudeOf(stop), longitudeOf(stop));
            w.writeEndElement(); // ScheduledStopPoint
        }
        w.writeEndElement(); // scheduledStopPoints

        // --- PassengerStopAssignments: liga ScheduledStopPoint <-> Quay ---
        w.writeStartElement("stopAssignments");
        int assignmentOrder = 1;
        for (BusStop stop : stops)
        {
            w.writeStartElement("PassengerStopAssignment");
            w.writeAttribute("version", NETEX_VERSION);
            w.writeAttribute("order", Integer.toString(assignmentOrder++));
            w.writeAttribute("id", id("PassengerStopAssignment", stop.getCode()));
            writeRef(w, "ScheduledStopPointRef", id("ScheduledStopPoint", stop.getCode()));
            writeRef(w, "QuayRef", id("Quay", stop.getCode()));
            w.writeEndElement(); // PassengerStopAssignment
        }
        w.writeEndElement(); // stopAssignments

        // --- JourneyPatterns (com StopPointInJourneyPattern ordenados) ---
        w.writeStartElement("journeyPatterns");
        for (Route route : routes)
        {
            List<JourneyPattern> patterns =
                patternRepo.findByRouteIdOrderByDirectionIdAscIdAsc(route.getId());
            for (JourneyPattern pattern : patterns)
            {
                List<PatternStop> patternStops =
                    patternStopRepo.findByPatternIdOrderByStopSequence(pattern.getId());
                if (patternStops.isEmpty())
                {
                    continue; // padrao sem paragens carregadas: nada coerente a emitir
                }

                w.writeStartElement("ServiceJourneyPattern");
                w.writeAttribute("version", NETEX_VERSION);
                w.writeAttribute("id", id("JourneyPattern", String.valueOf(pattern.getId())));

                if (pattern.getName() != null && !pattern.getName().isBlank())
                {
                    writeText(w, "Name", pattern.getName());
                }
                writeRef(w, "RouteRef", id("Line", route.getCode()));

                w.writeStartElement("pointsInSequence");
                int order = 1;
                for (PatternStop ps : patternStops)
                {
                    BusStop stop = ps.getStop();
                    if (stop == null) { continue; }
                    w.writeStartElement("StopPointInJourneyPattern");
                    w.writeAttribute("version", NETEX_VERSION);
                    w.writeAttribute("order", Integer.toString(order));
                    // Id chaveado pelo stop_sequence (chave estavel partilhada com
                    // TripStopTime), para que o StopPointInJourneyPatternRef dos
                    // passingTimes resolva sempre para este id.
                    w.writeAttribute("id",
                        id("StopPointInJourneyPattern",
                           pattern.getId() + "-" + ps.getStopSequence()));
                    writeRef(w, "ScheduledStopPointRef", id("ScheduledStopPoint", stop.getCode()));
                    w.writeEndElement(); // StopPointInJourneyPattern
                    order++;
                }
                w.writeEndElement(); // pointsInSequence

                w.writeEndElement(); // ServiceJourneyPattern
            }
        }
        w.writeEndElement(); // journeyPatterns

        w.writeEndElement(); // ServiceFrame
    }

    // ------------------------------------------------------------------
    // TimetableFrame: ServiceJourneys + DayTypes
    // ------------------------------------------------------------------

    private void writeTimetableFrame(XMLStreamWriter w) throws XMLStreamException
    {
        // serviceId -> dias da semana, derivado de service_calendar (R.IVT.05).
        Map<String, DayType> dayTypes = loadDayTypes();

        w.writeStartElement("TimetableFrame");
        w.writeAttribute("version", NETEX_VERSION);
        w.writeAttribute("id", frameId("TimetableFrame", "timetable"));

        // --- ServiceJourneys (uma por Trip) ---
        w.writeStartElement("vehicleJourneys");
        List<Route> routes = routeRepo.findAll();
        for (Route route : routes)
        {
            List<JourneyPattern> patterns =
                patternRepo.findByRouteIdOrderByDirectionIdAscIdAsc(route.getId());
            for (JourneyPattern pattern : patterns)
            {
                List<Trip> trips = tripRepo.findByPatternId(pattern.getId());
                for (Trip trip : trips)
                {
                    List<TripStopTime> times =
                        tripStopTimeRepo.findByTripIdOrderByStopSequence(trip.getId());
                    if (times.isEmpty())
                    {
                        continue; // sem horas: ServiceJourney sem passingTimes seria invalido
                    }

                    String journeyKey = trip.getGtfsTripId();

                    w.writeStartElement("ServiceJourney");
                    w.writeAttribute("version", NETEX_VERSION);
                    w.writeAttribute("id", id("ServiceJourney", journeyKey));

                    if (trip.getHeadsign() != null && !trip.getHeadsign().isBlank())
                    {
                        writeText(w, "Name", trip.getHeadsign());
                    }

                    // DayType so e' referenciado se existir no calendario (senao
                    // o DayTypeRef apontaria para um id nao emitido).
                    if (trip.getServiceId() != null && dayTypes.containsKey(trip.getServiceId()))
                    {
                        w.writeStartElement("dayTypes");
                        writeRef(w, "DayTypeRef", id("DayType", trip.getServiceId()));
                        w.writeEndElement(); // dayTypes
                    }

                    writeRef(w, "JourneyPatternRef",
                             id("JourneyPattern", String.valueOf(pattern.getId())));
                    writeRef(w, "LineRef", id("Line", route.getCode()));

                    w.writeStartElement("passingTimes");
                    for (TripStopTime tst : times)
                    {
                        BusStop stop = tst.getStop();
                        if (stop == null) { continue; }
                        w.writeStartElement("TimetabledPassingTime");
                        w.writeAttribute("version", NETEX_VERSION);
                        writeRef(w, "StopPointInJourneyPatternRef",
                                 id("StopPointInJourneyPattern",
                                    pattern.getId() + "-" + tst.getStopSequence()));
                        if (tst.getArrivalTime() != null)
                        {
                            writeText(w, "ArrivalTime", toNetexTime(tst.getArrivalTime()));
                        }
                        if (tst.getDepartureTime() != null)
                        {
                            writeText(w, "DepartureTime", toNetexTime(tst.getDepartureTime()));
                        }
                        w.writeEndElement(); // TimetabledPassingTime
                    }
                    w.writeEndElement(); // passingTimes

                    w.writeEndElement(); // ServiceJourney
                }
            }
        }
        w.writeEndElement(); // vehicleJourneys

        // --- DayTypes + DayTypeAssignments derivados de service_calendar ---
        if (!dayTypes.isEmpty())
        {
            w.writeStartElement("dayTypes");
            for (Map.Entry<String, DayType> e : dayTypes.entrySet())
            {
                DayType dt = e.getValue();
                w.writeStartElement("DayType");
                w.writeAttribute("version", NETEX_VERSION);
                w.writeAttribute("id", id("DayType", dt.serviceId));
                writeText(w, "Name", dt.serviceId);

                if (!dt.daysOfWeek.isEmpty())
                {
                    w.writeStartElement("properties");
                    w.writeStartElement("PropertyOfDay");
                    writeText(w, "DaysOfWeek", String.join(" ", dt.daysOfWeek));
                    w.writeEndElement(); // PropertyOfDay
                    w.writeEndElement(); // properties
                }
                w.writeEndElement(); // DayType
            }
            w.writeEndElement(); // dayTypes
        }

        w.writeEndElement(); // TimetableFrame
    }

    // ------------------------------------------------------------------
    // service_calendar -> DayType
    // ------------------------------------------------------------------

    /**
     * Le a tabela {@code service_calendar} (migracao V39, importada do
     * calendar.txt do GTFS) e mapeia cada {@code service_id} para um
     * {@link DayType} NeTEx com a lista de dias da semana ativos. Usa
     * JdbcTemplate (mesmo estilo do {@code PatternService}); a tabela nao
     * tem entidade JPA dedicada. Excecoes pontuais (calendar_dates) sao
     * omitidas deste subconjunto essencial.
     */
    private Map<String, DayType> loadDayTypes()
    {
        Map<String, DayType> result = new LinkedHashMap<>();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT service_id, monday, tuesday, wednesday, thursday, friday, "
            + "saturday, sunday FROM service_calendar ORDER BY service_id");

        for (Map<String, Object> row : rows)
        {
            String serviceId = (String) row.get("service_id");
            if (serviceId == null) { continue; }

            DayType dt = result.computeIfAbsent(serviceId, DayType::new);
            addDay(dt, row, "monday", "Monday");
            addDay(dt, row, "tuesday", "Tuesday");
            addDay(dt, row, "wednesday", "Wednesday");
            addDay(dt, row, "thursday", "Thursday");
            addDay(dt, row, "friday", "Friday");
            addDay(dt, row, "saturday", "Saturday");
            addDay(dt, row, "sunday", "Sunday");
        }
        return result;
    }

    private void addDay(DayType dt, Map<String, Object> row, String column, String netexDay)
    {
        Object v = row.get(column);
        if (v instanceof Boolean && (Boolean) v)
        {
            dt.daysOfWeek.add(netexDay);
        }
    }

    /** Estrutura interna leve: service_id + dias da semana ativos. */
    private static final class DayType
    {
        final String serviceId;
        final List<String> daysOfWeek = new ArrayList<>();

        DayType(String serviceId) { this.serviceId = serviceId; }
    }

    // ------------------------------------------------------------------
    // Helpers de escrita
    // ------------------------------------------------------------------

    /** Escreve {@code <Centroid><Location><Latitude/><Longitude/></Location></Centroid>}. */
    private void writeCentroid(XMLStreamWriter w, Double lat, Double lon) throws XMLStreamException
    {
        if (lat == null || lon == null) { return; }
        w.writeStartElement("Centroid");
        w.writeStartElement("Location");
        writeText(w, "Latitude", Double.toString(lat));
        writeText(w, "Longitude", Double.toString(lon));
        w.writeEndElement(); // Location
        w.writeEndElement(); // Centroid
    }

    /** Elemento simples com texto: {@code <Name>valor</Name>}. Omite se valor nulo. */
    private void writeText(XMLStreamWriter w, String element, String value) throws XMLStreamException
    {
        if (value == null) { return; }
        w.writeStartElement(element);
        w.writeCharacters(value);
        w.writeEndElement();
    }

    /** Elemento de referencia: {@code <OperatorRef ref="..."/>} com a versao. */
    private void writeRef(XMLStreamWriter w, String element, String ref) throws XMLStreamException
    {
        w.writeStartElement(element);
        w.writeAttribute("version", NETEX_VERSION);
        w.writeAttribute("ref", ref);
        w.writeEndElement();
    }

    // ------------------------------------------------------------------
    // Helpers de id / valores
    // ------------------------------------------------------------------

    /** Id NeTEx no formato {@code CODESPACE:Tipo:codigo} (ex.: TUB:Quay:STOP_001). */
    private String id(String type, String code)
    {
        return CODESPACE + ":" + type + ":" + sanitize(code);
    }

    /** Id de frame: {@code CODESPACE:Tipo:sufixo}. */
    private String frameId(String type, String suffix)
    {
        return CODESPACE + ":" + type + ":" + suffix;
    }

    /**
     * Limpa um codigo para uso seguro num id NeTEx (NCName-friendly): espacos
     * e caracteres invalidos viram '_'. Mantem letras, digitos, '_', '-' e '.'.
     */
    private String sanitize(String code)
    {
        if (code == null || code.isBlank()) { return "unknown"; }
        return code.trim().replaceAll("[^A-Za-z0-9_.\\-]", "_");
    }

    private String stripHash(String color)
    {
        return color.startsWith("#") ? color.substring(1) : color;
    }

    /**
     * Normaliza uma hora GTFS ("HH:MM" ou "HH:MM:SS", podendo passar das 24h)
     * para o formato xsd:time de NeTEx ("HH:MM:SS"). Horas >= 24 sao
     * truncadas ao modulo 24 para se manterem validas como xsd:time.
     */
    private String toNetexTime(String gtfsTime)
    {
        if (gtfsTime == null || gtfsTime.isBlank()) { return null; }
        String[] parts = gtfsTime.trim().split(":");
        if (parts.length < 2) { return gtfsTime; }
        try
        {
            int h = Integer.parseInt(parts[0]) % 24;
            int m = Integer.parseInt(parts[1]);
            int s = parts.length >= 3 ? Integer.parseInt(parts[2]) : 0;
            return String.format("%02d:%02d:%02d", h, m, s);
        }
        catch (NumberFormatException ex)
        {
            return gtfsTime;
        }
    }

    // ------------------------------------------------------------------
    // Leitura de coordenadas (BusStop.location e' um JTS Point WGS84)
    // ------------------------------------------------------------------

    private Double latitudeOf(BusStop stop)
    {
        return (stop.getLocation() != null) ? stop.getLocation().getY() : null;
    }

    private Double longitudeOf(BusStop stop)
    {
        return (stop.getLocation() != null) ? stop.getLocation().getX() : null;
    }
}
