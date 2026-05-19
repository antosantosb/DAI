package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "stop_schedule")
public class StopSchedule
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "route_id", nullable = false)
    private Route route;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stop_id", nullable = false)
    private BusStop stop;

    @Column(name = "trip_id", nullable = false, length = 100)
    private String tripId;

    @Column(name = "arrival_time", nullable = false, length = 10)
    private String arrivalTime;

    @Column(name = "departure_time", nullable = false, length = 10)
    private String departureTime;

    @Column(name = "stop_sequence", nullable = false)
    private Integer stopSequence;

    @Column(name = "direction_id")
    private Integer directionId = 0;

    @Column(name = "service_id", length = 100)
    private String serviceId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "gtfs_import_id")
    private GtfsImport gtfsImport;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    public StopSchedule() {}

    // GET
    public Long       getId()            { return this.id; }
    public Route      getRoute()         { return this.route; }
    public BusStop    getStop()          { return this.stop; }
    public String     getTripId()        { return this.tripId; }
    public String     getArrivalTime()   { return this.arrivalTime; }
    public String     getDepartureTime() { return this.departureTime; }
    public Integer    getStopSequence()  { return this.stopSequence; }
    public Integer    getDirectionId()   { return this.directionId; }
    public String     getServiceId()     { return this.serviceId; }
    public GtfsImport getGtfsImport()    { return this.gtfsImport; }
    public Instant    getCreatedAt()     { return this.createdAt; }

    // SET
    public void setId(Long id)                      { this.id = id; }
    public void setRoute(Route route)               { this.route = route; }
    public void setStop(BusStop stop)               { this.stop = stop; }
    public void setTripId(String tripId)            { this.tripId = tripId; }
    public void setArrivalTime(String time)         { this.arrivalTime = time; }
    public void setDepartureTime(String time)       { this.departureTime = time; }
    public void setStopSequence(Integer seq)        { this.stopSequence = seq; }
    public void setDirectionId(Integer dir)         { this.directionId = dir; }
    public void setServiceId(String serviceId)      { this.serviceId = serviceId; }
    public void setGtfsImport(GtfsImport imp)       { this.gtfsImport = imp; }
    public void setCreatedAt(Instant createdAt)     { this.createdAt = createdAt; }
}
