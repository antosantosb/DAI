package dai.tub.pgu.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

// Esta anotação diz ao Java: "Se o sensor enviar campos extra que eu 
// não conheço, ignora-os em vez de dar erro e crashar."
@JsonIgnoreProperties(ignoreUnknown = true)
public class TelemetryDTO 
{
    private String busId, status;
    private Double latitude, longitude, speed;

    public TelemetryDTO() {}

    // GET
    public String getBusId()     { return busId; }
    public String getStatus()    { return status; }
    public Double getLatitude()  { return latitude; }
    public Double getLongitude() { return longitude; }
    public Double getSpeed()     { return speed; }
    
    // SET
    public void setBusId(String busId)         { this.busId = busId; }
    public void setStatus(String status)       { this.status = status; }
    public void setLatitude(Double latitude)   { this.latitude = latitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public void setSpeed(Double speed)         { this.speed = speed; }

    @Override
    public String toString()
    {
        return "TelemetryDTO {" +
                "busId='" + busId + '\'' +
                ", latitude=" + latitude +
                ", longitude=" + longitude +
                ", speed=" + speed +
                ", status='" + status + '\'' +
                '}';
    }
}
