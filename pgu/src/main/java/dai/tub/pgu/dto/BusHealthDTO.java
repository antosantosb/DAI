package dai.tub.pgu.dto;

import java.time.Instant;

public class BusHealthDTO {
    private String busId; // Corresponds to BusCode
    private Instant lastSync;
    private String healthStatus;
    private int uptimePercentage;

    public BusHealthDTO(String busId, Instant lastSync, String healthStatus, int uptimePercentage) {
        this.busId = busId;
        this.lastSync = lastSync;
        this.healthStatus = healthStatus;
        this.uptimePercentage = uptimePercentage;
    }

    public String getBusId() {
        return busId;
    }

    public void setBusId(String busId) {
        this.busId = busId;
    }

    public Instant getLastSync() {
        return lastSync;
    }

    public void setLastSync(Instant lastSync) {
        this.lastSync = lastSync;
    }

    public String getHealthStatus() {
        return healthStatus;
    }

    public void setHealthStatus(String healthStatus) {
        this.healthStatus = healthStatus;
    }

    public int getUptimePercentage() {
        return uptimePercentage;
    }

    public void setUptimePercentage(int uptimePercentage) {
        this.uptimePercentage = uptimePercentage;
    }
}
