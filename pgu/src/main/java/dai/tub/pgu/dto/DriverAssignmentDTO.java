package dai.tub.pgu.dto;

public class DriverAssignmentDTO {
    private Long driverId;
    private String busId;

    // Getters e Setters
    public Long getDriverId() { return driverId; }
    public void setDriverId(Long driverId) { this.driverId = driverId; }
    public String getBusId() { return busId; }
    public void setBusId(String busId) { this.busId = busId; }
}