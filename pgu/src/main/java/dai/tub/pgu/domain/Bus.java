package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
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

    // Fase E: instante em que o autocarro foi descomissionado (soft-delete).
    // Null se ainda nao foi descomissionado.
    @Column(name = "decommissioned_at")
    private Instant decommissionedAt;

    // Sprint 4 (3.2): tri-powertrain + campos condicionais.
    @Column(nullable = false, length = 16)
    private String powertrain = "DIESEL";  // DIESEL | ELECTRIC | CNG

    // Combustao (DIESEL + CNG)
    @Column(name = "fuel_tank_l", precision = 6, scale = 1)
    private BigDecimal fuelTankL;
    @Column(name = "adblue_tank_l", precision = 6, scale = 1)
    private BigDecimal adblueTankL;

    // ELECTRIC
    @Column(name = "battery_kwh", precision = 6, scale = 1)
    private BigDecimal batteryKwh;
    @Column(name = "charging_type", length = 16)
    private String chargingType;  // SLOW | FAST | OPPORTUNITY

    // CNG
    @Column(name = "cng_tank_kg", precision = 6, scale = 1)
    private BigDecimal cngTankKg;
    @Column(name = "cng_nominal_bar", precision = 5, scale = 1)
    private BigDecimal cngNominalBar;

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
    public Instant getDecommissionedAt() { return this.decommissionedAt; }
    public String     getPowertrain()    { return this.powertrain; }
    public BigDecimal getFuelTankL()     { return this.fuelTankL; }
    public BigDecimal getAdblueTankL()   { return this.adblueTankL; }
    public BigDecimal getBatteryKwh()    { return this.batteryKwh; }
    public String     getChargingType()  { return this.chargingType; }
    public BigDecimal getCngTankKg()     { return this.cngTankKg; }
    public BigDecimal getCngNominalBar() { return this.cngNominalBar; }

    // SET
    public void setId(Long id)                     { this.id = id; }
    public void setBusCode(String busCode)         { this.busCode = busCode; }
    public void setLicensePlate(String plate)      { this.licensePlate = plate; }
    public void setCapacity(Integer capacity)      { this.capacity = capacity; }
    public void setRoute(Route route)              { this.route = route; }
    public void setBlock(Block block)              { this.block = block; }
    public void setStatus(String status)           { this.status = status; }
    public void setLastSync(Instant lastSync)      { this.lastSync = lastSync; }
    public void setDecommissionedAt(Instant when)  { this.decommissionedAt = when; }
    public void setPowertrain(String p)            { this.powertrain = p; }
    public void setFuelTankL(BigDecimal v)         { this.fuelTankL = v; }
    public void setAdblueTankL(BigDecimal v)       { this.adblueTankL = v; }
    public void setBatteryKwh(BigDecimal v)        { this.batteryKwh = v; }
    public void setChargingType(String v)          { this.chargingType = v; }
    public void setCngTankKg(BigDecimal v)         { this.cngTankKg = v; }
    public void setCngNominalBar(BigDecimal v)     { this.cngNominalBar = v; }
}
