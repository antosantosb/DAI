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

    @Column(name = "speed_kmh")
    private Double speedKmh;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    public VehicleTelemetry() {}

    public VehicleTelemetry(String busId, Point location, Double speedKmh, Instant recordedAt) 
    {
        this.busId = busId;
        this.location = location;
        this.speedKmh = speedKmh;
        this.recordedAt = recordedAt;
    }

    // GET
    public Long    getId()         { return id; }
    public String  getBusId()      { return busId; }
    public Point   getLocation()   { return location; }
    public Double  getSpeedKmh()   { return speedKmh; }
    public Instant getRecordedAt() { return recordedAt; }
    
    // SET
    public void setId(Long id)                    { this.id = id; }
    public void setBusId(String busId)            { this.busId = busId; }
    public void setLocation(Point location)       { this.location = location; }
    public void setSpeedKmh(Double speedKmh)      { this.speedKmh = speedKmh; }
    public void setRecordedAt(Instant recordedAt) { this.recordedAt = recordedAt; }
}