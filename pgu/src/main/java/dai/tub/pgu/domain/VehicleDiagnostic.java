package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Sprint 4 (3.2): Diagnostico OBD/CAN (FMS / J1939).
 * Particionada por mes em recorded_at (PK composta).
 * Campos condicionais ao powertrain do bus.
 */
@Entity
@Table(name = "vehicle_diagnostic")
@IdClass(VehicleDiagnostic.Pk.class)
public class VehicleDiagnostic {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Id
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt = Instant.now();

    @Column(name = "bus_id", nullable = false, length = 32)
    private String busId;

    @Column(nullable = false, length = 16)
    private String powertrain;

    @Column(name = "odometer_km", precision = 10, scale = 1)  private BigDecimal odometerKm;
    @Column(name = "service_hours", precision = 8, scale = 1) private BigDecimal serviceHours;
    @Column(name = "door_open_count")                          private Integer doorOpenCount;
    @Column(name = "ambient_temp_c", precision = 4, scale = 1) private BigDecimal ambientTempC;
    @Column(name = "speed_kmh", precision = 5, scale = 1)     private BigDecimal speedKmh;

    // Combustao (DIESEL+CNG)
    @Column(name = "engine_rpm")                               private Integer engineRpm;
    @Column(name = "coolant_temp_c", precision = 4, scale = 1) private BigDecimal coolantTempC;
    @Column(name = "oil_pressure_bar", precision = 4, scale = 1) private BigDecimal oilPressureBar;

    // DIESEL
    @Column(name = "fuel_level_pct")    private Short fuelLevelPct;
    @Column(name = "adblue_level_pct")  private Short adblueLevelPct;
    @Column(name = "dpf_soot_pct")      private Short dpfSootPct;

    // CNG
    @Column(name = "cng_pressure_bar", precision = 5, scale = 1) private BigDecimal cngPressureBar;
    @Column(name = "cng_level_pct")    private Short cngLevelPct;

    // ELECTRIC
    @Column(name = "soc_pct")          private Short socPct;
    @Column(name = "soh_pct")          private Short sohPct;
    @Column(name = "regen_kw", precision = 5, scale = 1) private BigDecimal regenKw;
    @Column(name = "motor_kw", precision = 5, scale = 1) private BigDecimal motorKw;

    @Column(name = "dtc_codes", columnDefinition = "text")
    private String dtcCodes;

    /** PK composta. */
    public static class Pk implements java.io.Serializable {
        private Long id;
        private Instant recordedAt;
        public Pk() {}
        public Pk(Long id, Instant recordedAt) { this.id = id; this.recordedAt = recordedAt; }
        @Override public int hashCode() { return java.util.Objects.hash(id, recordedAt); }
        @Override public boolean equals(Object o) {
            if (!(o instanceof Pk p)) return false;
            return java.util.Objects.equals(id, p.id) && java.util.Objects.equals(recordedAt, p.recordedAt);
        }
    }

    public Long getId() { return id; }
    public Instant getRecordedAt() { return recordedAt; }
    public String getBusId() { return busId; }
    public String getPowertrain() { return powertrain; }
    public BigDecimal getOdometerKm() { return odometerKm; }
    public BigDecimal getServiceHours() { return serviceHours; }
    public Integer getDoorOpenCount() { return doorOpenCount; }
    public BigDecimal getAmbientTempC() { return ambientTempC; }
    public BigDecimal getSpeedKmh() { return speedKmh; }
    public Integer getEngineRpm() { return engineRpm; }
    public BigDecimal getCoolantTempC() { return coolantTempC; }
    public BigDecimal getOilPressureBar() { return oilPressureBar; }
    public Short getFuelLevelPct() { return fuelLevelPct; }
    public Short getAdblueLevelPct() { return adblueLevelPct; }
    public Short getDpfSootPct() { return dpfSootPct; }
    public BigDecimal getCngPressureBar() { return cngPressureBar; }
    public Short getCngLevelPct() { return cngLevelPct; }
    public Short getSocPct() { return socPct; }
    public Short getSohPct() { return sohPct; }
    public BigDecimal getRegenKw() { return regenKw; }
    public BigDecimal getMotorKw() { return motorKw; }
    public String getDtcCodes() { return dtcCodes; }

    public void setId(Long id) { this.id = id; }
    public void setRecordedAt(Instant t) { this.recordedAt = t; }
    public void setBusId(String s) { this.busId = s; }
    public void setPowertrain(String s) { this.powertrain = s; }
    public void setOdometerKm(BigDecimal v) { this.odometerKm = v; }
    public void setServiceHours(BigDecimal v) { this.serviceHours = v; }
    public void setDoorOpenCount(Integer v) { this.doorOpenCount = v; }
    public void setAmbientTempC(BigDecimal v) { this.ambientTempC = v; }
    public void setSpeedKmh(BigDecimal v) { this.speedKmh = v; }
    public void setEngineRpm(Integer v) { this.engineRpm = v; }
    public void setCoolantTempC(BigDecimal v) { this.coolantTempC = v; }
    public void setOilPressureBar(BigDecimal v) { this.oilPressureBar = v; }
    public void setFuelLevelPct(Short v) { this.fuelLevelPct = v; }
    public void setAdblueLevelPct(Short v) { this.adblueLevelPct = v; }
    public void setDpfSootPct(Short v) { this.dpfSootPct = v; }
    public void setCngPressureBar(BigDecimal v) { this.cngPressureBar = v; }
    public void setCngLevelPct(Short v) { this.cngLevelPct = v; }
    public void setSocPct(Short v) { this.socPct = v; }
    public void setSohPct(Short v) { this.sohPct = v; }
    public void setRegenKw(BigDecimal v) { this.regenKw = v; }
    public void setMotorKw(BigDecimal v) { this.motorKw = v; }
    public void setDtcCodes(String s) { this.dtcCodes = s; }
}
