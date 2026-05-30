package dai.tub.pgu.domain;

import jakarta.persistence.*;
import org.locationtech.jts.geom.Point;
import java.time.Instant;

@Entity
@Table(name = "vehicle_telemetry")
public class VehicleTelemetry 
{

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bus_id", nullable = false)
    private String busId;

    @Column(columnDefinition = "geometry(Point,4326)", nullable = false)
    private Point location;

    @Column(name = "passenger_count")
    private int passengerCount;

    // Sprint 2 (Vertical 3.4, R.ICP.01): contagem APC por paragem.
    // boarded/alighted = entradas/saidas na ultima paragem; onboard = ocupacao
    // instantanea a bordo. Nullable para tolerar produtores antigos (a ingestao
    // faz fallback onboard = passengerCount quando estes campos nao vierem).
    @Column(name = "boarded")
    private Integer boarded;

    @Column(name = "alighted")
    private Integer alighted;

    @Column(name = "onboard")
    private Integer onboard;

    @Column(name = "speed_kmh")
    private Double speedKmh;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "next_stop")
    private String nextStop;

    @Column(name = "stops_remaining")
    private Integer stopsRemaining;

    public VehicleTelemetry() {}

    public VehicleTelemetry(String busId, Point location, int passengerCount, Double speedKmh, Instant recordedAt, String status) 
    {
        this.busId = busId;
        this.location = location;
        this.passengerCount = passengerCount;
        this.speedKmh = speedKmh;
        this.recordedAt = recordedAt;
        this.status = status;
    }

    // GET
    public Long    getId()         { return this.id; }
    public String  getBusId()      { return this.busId; }
    public Point   getLocation()   { return this.location; }
    public int     getPassengers() { return this.passengerCount; }
    public Integer getBoarded()    { return this.boarded; }
    public Integer getAlighted()   { return this.alighted; }
    public Integer getOnboard()    { return this.onboard; }
    public Double  getSpeedKmh()   { return this.speedKmh; }
    public Instant getRecordedAt() { return this.recordedAt; }
    public String  getStatus()         { return this.status; }
    public String  getNextStop()       { return this.nextStop; }
    public Integer getStopsRemaining() { return this.stopsRemaining; }

    // SET
    public void setId(Long id)                     { this.id = id; }
    public void setBusId(String busId)             { this.busId = busId; }
    public void setLocation(Point location)        { this.location = location; }
    public void setPassengers(int passengerCount) { this.passengerCount = passengerCount; }
    public void setBoarded(Integer boarded)        { this.boarded = boarded; }
    public void setAlighted(Integer alighted)      { this.alighted = alighted; }
    public void setOnboard(Integer onboard)        { this.onboard = onboard; }
    public void setSpeedKmh(Double speedKmh)       { this.speedKmh = speedKmh; }
    public void setRecordedAt(Instant recordedAt)  { this.recordedAt = recordedAt; }
    public void setStatus(String status)                   { this.status = status; }
    public void setNextStop(String nextStop)               { this.nextStop = nextStop; }
    public void setStopsRemaining(Integer stopsRemaining)  { this.stopsRemaining = stopsRemaining; }
}