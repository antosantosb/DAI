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

    @Column(name = "speed_kmh")
    private Double speedKmh;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    @Column(name = "status", nullable = false)
    private String status;

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
    public Double  getSpeedKmh()   { return this.speedKmh; }
    public Instant getRecordedAt() { return this.recordedAt; }
    public String  getStatus()     { return this.status; }
    
    // SET
    public void setId(Long id)                     { this.id = id; }
    public void setBusId(String busId)             { this.busId = busId; }
    public void setLocation(Point location)        { this.location = location; }
    public void setPassengers(int passengerCount) { this.passengerCount = passengerCount; }
    public void setSpeedKmh(Double speedKmh)       { this.speedKmh = speedKmh; }
    public void setRecordedAt(Instant recordedAt)  { this.recordedAt = recordedAt; }
    public void setStatus(String status)           { this.status = status; }
}