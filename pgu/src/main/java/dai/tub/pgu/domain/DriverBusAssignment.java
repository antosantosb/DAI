package dai.tub.pgu.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "driver_bus_assignments")
public class DriverBusAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "driver_id", nullable = false)
    private Driver driver;

    @Column(name = "bus_id", nullable = false)
    private Long busId;

    @Column(name = "assigned_at", nullable = false)
    private Instant assignedAt = Instant.now();

    @Column(name = "unassigned_at")
    private Instant unassignedAt;

    @Column(nullable = false)
    private boolean active = true;

    public DriverBusAssignment() {}

    public DriverBusAssignment(Driver driver, Long busId) {
        this.driver = driver;
        this.busId = busId;
        this.assignedAt = Instant.now();
        this.active = true;
    }

    // Getters e Setters
    public Long getId() { return id; }
    public Driver getDriver() { return driver; }
    public Long getBusId() { return busId; }
    public Instant getAssignedAt() { return assignedAt; }
    public Instant getUnassignedAt() { return unassignedAt; }
    public boolean isActive() { return active; }

    public void deactivate() {
        this.active = false;
        this.unassignedAt = Instant.now();
    }
}
