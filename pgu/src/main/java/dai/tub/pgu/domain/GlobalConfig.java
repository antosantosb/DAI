package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "global_config")
public class GlobalConfig {
    @Id 
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Integer delayLimitMinutes;
    private Integer socTolerancePercent;
    private Integer iotIntegrationLimit;
    private Instant updatedAt;
    private String updatedBy;

    // Sprint 0 (F4 follow-up): owner default das DataSources que nao tem
    // owner proprio. Editavel via /backoffice/configuracoes.
    @Column(name = "default_owner_name", length = 64)
    private String defaultOwnerName;

    @Column(name = "default_owner_email", length = 128)
    private String defaultOwnerEmail;

    // Sprint 2 (Vertical 3.4, R.ICP.05): thresholds de ocupacao (onboard/capacidade
    // em %). warning < critical garantido pela validacao no controller. no_data
    // e' o numero de minutos sem reporte de um bus activo antes de emitir alerta
    // de "sem dados de ocupacao".
    @Column(name = "occupancy_warning_pct")
    private Integer occupancyWarningPct;

    @Column(name = "occupancy_critical_pct")
    private Integer occupancyCriticalPct;

    @Column(name = "occupancy_no_data_minutes")
    private Integer occupancyNoDataMinutes;

    public GlobalConfig() {}

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Integer getDelayLimitMinutes() {
        return delayLimitMinutes;
    }

    public void setDelayLimitMinutes(Integer delayLimitMinutes) {
        this.delayLimitMinutes = delayLimitMinutes;
    }

    public Integer getSocTolerancePercent() {
        return socTolerancePercent;
    }

    public void setSocTolerancePercent(Integer socTolerancePercent) {
        this.socTolerancePercent = socTolerancePercent;
    }

    public Integer getIotIntegrationLimit() {
        return iotIntegrationLimit;
    }

    public void setIotIntegrationLimit(Integer iotIntegrationLimit) {
        this.iotIntegrationLimit = iotIntegrationLimit;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(String updatedBy) {
        this.updatedBy = updatedBy;
    }

    public String getDefaultOwnerName() {
        return defaultOwnerName;
    }

    public void setDefaultOwnerName(String defaultOwnerName) {
        this.defaultOwnerName = defaultOwnerName;
    }

    public String getDefaultOwnerEmail() {
        return defaultOwnerEmail;
    }

    public void setDefaultOwnerEmail(String defaultOwnerEmail) {
        this.defaultOwnerEmail = defaultOwnerEmail;
    }

    public Integer getOccupancyWarningPct() {
        return occupancyWarningPct;
    }

    public void setOccupancyWarningPct(Integer occupancyWarningPct) {
        this.occupancyWarningPct = occupancyWarningPct;
    }

    public Integer getOccupancyCriticalPct() {
        return occupancyCriticalPct;
    }

    public void setOccupancyCriticalPct(Integer occupancyCriticalPct) {
        this.occupancyCriticalPct = occupancyCriticalPct;
    }

    public Integer getOccupancyNoDataMinutes() {
        return occupancyNoDataMinutes;
    }

    public void setOccupancyNoDataMinutes(Integer occupancyNoDataMinutes) {
        this.occupancyNoDataMinutes = occupancyNoDataMinutes;
    }
}