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
}