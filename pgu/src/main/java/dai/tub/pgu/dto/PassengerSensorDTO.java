package dai.tub.pgu.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import dai.tub.pgu.domain.PassengerSensor;

import java.time.Instant;

/**
 * Sprint 2 (Vertical 3.4, R.ICP.07): DTO publico do sensor APC.
 *
 * <p>A localizacao e' exposta como lat/lon (a entidade guarda um Point 4326).
 * Campos extra enviados pelo cliente sao ignorados.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PassengerSensorDTO {

    private Long id;
    private String gateway;
    private Long busId;
    private String doorPosition;
    private String status;
    private Instant lastReading;
    private Double latitude;
    private Double longitude;
    private Instant createdAt;
    private Instant updatedAt;

    public PassengerSensorDTO() {}

    public static PassengerSensorDTO from(PassengerSensor s) {
        PassengerSensorDTO dto = new PassengerSensorDTO();
        dto.id = s.getId();
        dto.gateway = s.getGateway();
        dto.busId = s.getBusId();
        dto.doorPosition = s.getDoorPosition();
        dto.status = s.getStatus();
        dto.lastReading = s.getLastReading();
        if (s.getLocation() != null) {
            dto.longitude = s.getLocation().getX();
            dto.latitude = s.getLocation().getY();
        }
        dto.createdAt = s.getCreatedAt();
        dto.updatedAt = s.getUpdatedAt();
        return dto;
    }

    // GET
    public Long    getId()           { return this.id; }
    public String  getGateway()      { return this.gateway; }
    public Long    getBusId()        { return this.busId; }
    public String  getDoorPosition() { return this.doorPosition; }
    public String  getStatus()       { return this.status; }
    public Instant getLastReading()  { return this.lastReading; }
    public Double  getLatitude()     { return this.latitude; }
    public Double  getLongitude()    { return this.longitude; }
    public Instant getCreatedAt()    { return this.createdAt; }
    public Instant getUpdatedAt()    { return this.updatedAt; }

    // SET
    public void setId(Long id)                       { this.id = id; }
    public void setGateway(String gateway)           { this.gateway = gateway; }
    public void setBusId(Long busId)                 { this.busId = busId; }
    public void setDoorPosition(String doorPosition) { this.doorPosition = doorPosition; }
    public void setStatus(String status)             { this.status = status; }
    public void setLastReading(Instant lastReading)  { this.lastReading = lastReading; }
    public void setLatitude(Double latitude)         { this.latitude = latitude; }
    public void setLongitude(Double longitude)       { this.longitude = longitude; }
    public void setCreatedAt(Instant createdAt)      { this.createdAt = createdAt; }
    public void setUpdatedAt(Instant updatedAt)      { this.updatedAt = updatedAt; }
}
