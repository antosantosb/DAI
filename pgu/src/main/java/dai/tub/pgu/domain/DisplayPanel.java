package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Sprint 3 (3.5): painel DMS numa paragem TUB. Estados: ONLINE, OFFLINE,
 * FAULTY, LOW_BATTERY, UNKNOWN, DISABLED. O scheduler de saude actualiza
 * o status com base no last_heartbeat (>5min sem ping = OFFLINE) e em
 * battery_pct (< critical = LOW_BATTERY).
 */
@Entity
@Table(name = "display_panel")
public class DisplayPanel {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "code", nullable = false, unique = true, length = 32)
    private String code;

    @Column(nullable = false, length = 128)
    private String name;

    @Column(nullable = false, length = 16)
    private String type;             // EPAPER | LED | TFT

    @Column(name = "stop_id", nullable = false)
    private Long stopId;

    @Column(nullable = false, length = 16)
    private String status = "UNKNOWN";

    @Column(name = "last_heartbeat")
    private Instant lastHeartbeat;

    @Column(name = "battery_pct")
    private Short batteryPct;

    @Column(name = "temperature_c", precision = 4, scale = 1)
    private BigDecimal temperatureC;

    @Column(name = "firmware_version", length = 32)
    private String firmwareVersion;

    @Column(name = "current_message", length = 256)
    private String currentMessage;

    @Column(name = "content_source", nullable = false, length = 16)
    private String contentSource = "DEFAULT_ETA";

    @Column(name = "heartbeat_interval_seconds", nullable = false)
    private Integer heartbeatIntervalSeconds = 30;

    @Column(name = "offline_threshold_seconds", nullable = false)
    private Integer offlineThresholdSeconds = 300;

    @Column(name = "battery_warning_pct", nullable = false)
    private Short batteryWarningPct = 30;

    @Column(name = "battery_critical_pct", nullable = false)
    private Short batteryCriticalPct = 15;

    @Column(nullable = false)
    private Boolean enabled = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void preUpdate() { this.updatedAt = Instant.now(); }

    // getters/setters
    public Long getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getType() { return type; }
    public Long getStopId() { return stopId; }
    public String getStatus() { return status; }
    public Instant getLastHeartbeat() { return lastHeartbeat; }
    public Short getBatteryPct() { return batteryPct; }
    public BigDecimal getTemperatureC() { return temperatureC; }
    public String getFirmwareVersion() { return firmwareVersion; }
    public String getCurrentMessage() { return currentMessage; }
    public String getContentSource() { return contentSource; }
    public Integer getHeartbeatIntervalSeconds() { return heartbeatIntervalSeconds; }
    public Integer getOfflineThresholdSeconds() { return offlineThresholdSeconds; }
    public Short getBatteryWarningPct() { return batteryWarningPct; }
    public Short getBatteryCriticalPct() { return batteryCriticalPct; }
    public Boolean getEnabled() { return enabled; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setId(Long id) { this.id = id; }
    public void setCode(String code) { this.code = code; }
    public void setName(String name) { this.name = name; }
    public void setType(String type) { this.type = type; }
    public void setStopId(Long stopId) { this.stopId = stopId; }
    public void setStatus(String status) { this.status = status; }
    public void setLastHeartbeat(Instant lastHeartbeat) { this.lastHeartbeat = lastHeartbeat; }
    public void setBatteryPct(Short batteryPct) { this.batteryPct = batteryPct; }
    public void setTemperatureC(BigDecimal temperatureC) { this.temperatureC = temperatureC; }
    public void setFirmwareVersion(String firmwareVersion) { this.firmwareVersion = firmwareVersion; }
    public void setCurrentMessage(String currentMessage) { this.currentMessage = currentMessage; }
    public void setContentSource(String contentSource) { this.contentSource = contentSource; }
    public void setHeartbeatIntervalSeconds(Integer s) { this.heartbeatIntervalSeconds = s; }
    public void setOfflineThresholdSeconds(Integer s) { this.offlineThresholdSeconds = s; }
    public void setBatteryWarningPct(Short s) { this.batteryWarningPct = s; }
    public void setBatteryCriticalPct(Short s) { this.batteryCriticalPct = s; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
    public void setCreatedAt(Instant t) { this.createdAt = t; }
    public void setUpdatedAt(Instant t) { this.updatedAt = t; }
}
