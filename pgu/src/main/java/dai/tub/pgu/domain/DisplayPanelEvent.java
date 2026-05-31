package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Sprint 3 (3.5): historico de eventos de um painel DMS (heartbeats,
 * mudancas de status, mensagens publicadas, alarmes).
 */
@Entity
@Table(name = "display_panel_event")
public class DisplayPanelEvent {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "panel_id", nullable = false)
    private Long panelId;

    @Column(nullable = false)
    private Instant ts = Instant.now();

    @Column(name = "event_type", nullable = false, length = 20)
    private String eventType;     // HEARTBEAT | STATUS_CHANGE | MESSAGE_PUBLISHED | MESSAGE_CLEARED | ALARM

    @Column(length = 16)
    private String status;

    @Column(name = "battery_pct")
    private Short batteryPct;

    @Column(name = "temperature_c", precision = 4, scale = 1)
    private BigDecimal temperatureC;

    @Column(length = 256)
    private String message;

    @Column(length = 256)
    private String detail;

    public Long getId() { return id; }
    public Long getPanelId() { return panelId; }
    public Instant getTs() { return ts; }
    public String getEventType() { return eventType; }
    public String getStatus() { return status; }
    public Short getBatteryPct() { return batteryPct; }
    public BigDecimal getTemperatureC() { return temperatureC; }
    public String getMessage() { return message; }
    public String getDetail() { return detail; }

    public void setId(Long id) { this.id = id; }
    public void setPanelId(Long panelId) { this.panelId = panelId; }
    public void setTs(Instant ts) { this.ts = ts; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public void setStatus(String status) { this.status = status; }
    public void setBatteryPct(Short batteryPct) { this.batteryPct = batteryPct; }
    public void setTemperatureC(BigDecimal temperatureC) { this.temperatureC = temperatureC; }
    public void setMessage(String message) { this.message = message; }
    public void setDetail(String detail) { this.detail = detail; }
}
