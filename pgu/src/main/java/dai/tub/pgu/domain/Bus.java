package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "buses")
public class Bus
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bus_code", unique = true, nullable = false)
    private String busCode;

    @Column(name = "license_plate")
    private String licensePlate;

    @Column
    private Integer capacity;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "route_id")
    private Route route;

    // Sprint 1 (Fase 1): bloco de trips que o autocarro executa (populado na Fase 4).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "block_id")
    private Block block;

    @Column(nullable = false)
    private String status = "STOPPED";

    @Column(name = "last_sync")
    private Instant lastSync;

    public Bus() {}

    // GET
    public Long    getId()           { return this.id; }
    public String  getBusCode()      { return this.busCode; }
    public String  getLicensePlate() { return this.licensePlate; }
    public Integer getCapacity()     { return this.capacity; }
    public Route   getRoute()        { return this.route; }
    public Block   getBlock()        { return this.block; }
    public String  getStatus()       { return this.status; }
    public Instant getLastSync()     { return this.lastSync; }

    // SET
    public void setId(Long id)                     { this.id = id; }
    public void setBusCode(String busCode)         { this.busCode = busCode; }
    public void setLicensePlate(String plate)      { this.licensePlate = plate; }
    public void setCapacity(Integer capacity)      { this.capacity = capacity; }
    public void setRoute(Route route)              { this.route = route; }
    public void setBlock(Block block)              { this.block = block; }
    public void setStatus(String status)           { this.status = status; }
    public void setLastSync(Instant lastSync)      { this.lastSync = lastSync; }
}
