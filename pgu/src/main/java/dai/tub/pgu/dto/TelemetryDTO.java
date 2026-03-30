package dai.tub.pgu.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

// Esta anotação diz ao Java: "Se o sensor enviar campos extra que eu 
// não conheço, ignora-os em vez de dar erro e crashar."
@JsonIgnoreProperties(ignoreUnknown = true)
public class TelemetryDTO 
{
    private String busId, status;
    private Double latitude, longitude, speed;
    private int passengerCount;
    private Instant timestamp;
    private String nextStop;
    private Integer stopsRemaining;

    public TelemetryDTO() {}

    // GET
    public String  getBusId()      { return this.busId; }
    public String  getStatus()     { return this.status; }
    public Double  getLatitude()   { return this.latitude; }
    public Double  getLongitude()  { return this.longitude; }
    public int     getPassengers() { return this.passengerCount; }
    public Double  getSpeed()      { return this.speed; }
    public Instant getTimestamp()      { return this.timestamp; }
    public String  getNextStop()       { return this.nextStop; }
    public Integer getStopsRemaining() { return this.stopsRemaining; }

    // SET
    public void setBusId(String busId)             { this.busId = busId; }
    public void setStatus(String status)           { this.status = status; }
    public void setLatitude(Double latitude)       { this.latitude = latitude; }
    public void setLongitude(Double longitude)     { this.longitude = longitude; }
    public void setPassengers(int passengerCount) { this.passengerCount = passengerCount; }
    public void setSpeed(Double speed)             { this.speed = speed; }
    public void setTimestamp(Instant timestamp)            { this.timestamp = timestamp; }
    public void setNextStop(String nextStop)               { this.nextStop = nextStop; }
    public void setStopsRemaining(Integer stopsRemaining)  { this.stopsRemaining = stopsRemaining; }

    @Override
    public String toString()
    {
        return "TelemetryDTO {" +
                "busId='" + busId + '\'' +
                ", latitude=" + latitude +
                ", longitude=" + longitude +
                ", passengerCount=" + passengerCount +
                ", speed=" + speed +
                ", status='" + status + '\'' +
                ", timestamp='" + timestamp + '\'' +
                '}';
    }
}
