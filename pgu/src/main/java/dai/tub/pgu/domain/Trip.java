package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "trip")
public class Trip
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pattern_id", nullable = false)
    private JourneyPattern pattern;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "route_id", nullable = false)
    private Route route;

    @Column(name = "service_id", nullable = false, length = 100)
    private String serviceId;

    @Column
    private String headsign;

    @Column(name = "gtfs_trip_id", nullable = false, unique = true, length = 100)
    private String gtfsTripId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "gtfs_import_id")
    private GtfsImport gtfsImport;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    public Trip() {}

    // GET
    public Long           getId()         { return this.id; }
    public JourneyPattern getPattern()    { return this.pattern; }
    public Route          getRoute()      { return this.route; }
    public String         getServiceId()  { return this.serviceId; }
    public String         getHeadsign()   { return this.headsign; }
    public String         getGtfsTripId() { return this.gtfsTripId; }
    public GtfsImport     getGtfsImport() { return this.gtfsImport; }
    public Instant        getCreatedAt()  { return this.createdAt; }

    // SET
    public void setId(Long id)                     { this.id = id; }
    public void setPattern(JourneyPattern pattern) { this.pattern = pattern; }
    public void setRoute(Route route)              { this.route = route; }
    public void setServiceId(String serviceId)     { this.serviceId = serviceId; }
    public void setHeadsign(String headsign)       { this.headsign = headsign; }
    public void setGtfsTripId(String gtfsTripId)   { this.gtfsTripId = gtfsTripId; }
    public void setGtfsImport(GtfsImport imp)      { this.gtfsImport = imp; }
    public void setCreatedAt(Instant createdAt)    { this.createdAt = createdAt; }
}
