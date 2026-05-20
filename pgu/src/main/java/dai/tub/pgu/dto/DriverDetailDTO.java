package dai.tub.pgu.dto;
import dai.tub.pgu.domain.Driver;
import dai.tub.pgu.domain.DriverBusAssignment;

public class DriverDetailDTO {
    private long id;
    private String name;
    private String mecanographicNumber;
    private String status;
    private String busId;

    public static DriverDetailDTO fromDriver(Driver driver, DriverBusAssignment currentAssignment) {
        DriverDetailDTO dto = new DriverDetailDTO();
        dto.id = driver.getId();
        dto.name = driver.getName();
        dto.mecanographicNumber = driver.getMechanographicNumber();
        dto.status = driver.getStatus();
        dto.busId = currentAssignment != null && currentAssignment.isActive() ? currentAssignment.getBusId() : null;
        return dto;
    }

    // Getters e Setters
    public long getId() { return id; }
    public void setId(long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getMecanographicNumber() { return mecanographicNumber; }
    public void setMecanographicNumber(String mecanographicNumber) { this.mecanographicNumber = mecanographicNumber; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getBusId() { return busId; }
    public void setBusId(String busId) { this.busId = busId; }

}
