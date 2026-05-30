package dai.tub.pgu.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import org.locationtech.jts.geom.Point;

import java.time.Instant;

/**
 * Sprint 2 (Vertical 3.4, R.ICP.07): inventario de sensores de contagem (APC).
 *
 * <p>Cada sensor e' um dispositivo fisico numa porta de um autocarro, ligado por
 * um gateway. Guarda estado, ultima leitura e localizacao (Point 4326, coerente
 * com bus_stops/vehicle_telemetry). O link ao autocarro e' opcional: um sensor
 * pode estar em stock/manutencao sem autocarro atribuido (bus_id null).
 *
 * <p>Schema em {@code db/migration/V46__create_passenger_sensor.sql}.
 */
@Entity
@Table(name = "passenger_sensor")
public class PassengerSensor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "gateway", nullable = false, length = 64)
    private String gateway;

    // FK opcional para buses.id (ON DELETE SET NULL na migracao). Mapeado como
    // valor simples (Long) para manter o CRUD leve e desacoplado da entidade Bus.
    @Column(name = "bus_id")
    private Long busId;

    @Column(name = "door_position", nullable = false, length = 16)
    private String doorPosition = "FRONT";

    @Column(name = "status", nullable = false, length = 16)
    private String status = "UNKNOWN";

    @Column(name = "last_reading")
    private Instant lastReading;

    @Column(name = "location", columnDefinition = "geometry(Point,4326)")
    private Point location;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public PassengerSensor() {}

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    // GET
    public Long    getId()           { return this.id; }
    public String  getGateway()      { return this.gateway; }
    public Long    getBusId()        { return this.busId; }
    public String  getDoorPosition() { return this.doorPosition; }
    public String  getStatus()       { return this.status; }
    public Instant getLastReading()  { return this.lastReading; }
    public Point   getLocation()     { return this.location; }
    public Instant getCreatedAt()    { return this.createdAt; }
    public Instant getUpdatedAt()    { return this.updatedAt; }

    // SET
    public void setId(Long id)                       { this.id = id; }
    public void setGateway(String gateway)           { this.gateway = gateway; }
    public void setBusId(Long busId)                 { this.busId = busId; }
    public void setDoorPosition(String doorPosition) { this.doorPosition = doorPosition; }
    public void setStatus(String status)             { this.status = status; }
    public void setLastReading(Instant lastReading)  { this.lastReading = lastReading; }
    public void setLocation(Point location)          { this.location = location; }
    public void setCreatedAt(Instant createdAt)      { this.createdAt = createdAt; }
    public void setUpdatedAt(Instant updatedAt)      { this.updatedAt = updatedAt; }
}
