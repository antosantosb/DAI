package dai.tub.pgu.dto;
import dai.tub.pgu.domain.Driver;
import dai.tub.pgu.domain.DriverBusAssignment;

public class DriverDetailDTO {
    private long id;
    private String name;
    private String mechanographicNumber;
    private String phoneNumber;
    private String status;
    private String keycloakUserId;
    private Long currentBusId;
    private String currentBusCode;     // ex: "TUB-001" — mais legível que o id
    private String currentBusStatus;   // ACTIVE / STOPPED — para a UI saber se pode desatribuir

    public static DriverDetailDTO fromDriver(Driver driver, DriverBusAssignment currentAssignment) {
        return fromDriver(driver, currentAssignment, null);
    }

    public static DriverDetailDTO fromDriver(Driver driver, DriverBusAssignment currentAssignment, dai.tub.pgu.domain.Bus currentBus) {
        DriverDetailDTO dto = new DriverDetailDTO();
        dto.id = driver.getId();
        dto.name = driver.getName();
        dto.mechanographicNumber = driver.getMechanographicNumber();
        dto.phoneNumber = driver.getPhoneNumber();
        dto.status = driver.getStatus();
        dto.keycloakUserId = driver.getKeycloakUserId();
        dto.currentBusId = currentAssignment != null && currentAssignment.isActive() ? currentAssignment.getBusId() : null;
        if (currentBus != null) {
            dto.currentBusCode = currentBus.getBusCode();
            dto.currentBusStatus = currentBus.getStatus();
        }
        return dto;
    }

    public long getId() { return id; }
    public void setId(long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getMechanographicNumber() { return mechanographicNumber; }
    public void setMechanographicNumber(String mechanographicNumber) { this.mechanographicNumber = mechanographicNumber; }
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getKeycloakUserId() { return keycloakUserId; }
    public void setKeycloakUserId(String keycloakUserId) { this.keycloakUserId = keycloakUserId; }
    public Long getCurrentBusId() { return currentBusId; }
    public void setCurrentBusId(Long currentBusId) { this.currentBusId = currentBusId; }

    public String getCurrentBusCode() { return currentBusCode; }
    public void setCurrentBusCode(String currentBusCode) { this.currentBusCode = currentBusCode; }

    public String getCurrentBusStatus() { return currentBusStatus; }
    public void setCurrentBusStatus(String currentBusStatus) { this.currentBusStatus = currentBusStatus; }
}
