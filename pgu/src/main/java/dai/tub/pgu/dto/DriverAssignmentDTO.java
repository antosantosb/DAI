package dai.tub.pgu.dto;

public class DriverAssignmentDTO {
    private Long driverId;
    private Long busId;

    // Getters e Setters
    public Long getDriverId() { return driverId; }
    public void setDriverId(Long driverId) { this.driverId = driverId; }
    public Long getBusId() { return busId; }
    public void setBusId(Long busId) { this.busId = busId; }
}