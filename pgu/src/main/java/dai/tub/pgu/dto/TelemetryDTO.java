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
    private Double temperaturaMotor;
    private Double nivelBateria;
    private String statusCarregador;
    private Integer delayMinutes;

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
    public Double  getTemperaturaMotor() { return this.temperaturaMotor; }
    public Double  getNivelBateria()     { return this.nivelBateria; }
    public String  getStatusCarregador() { return this.statusCarregador; }
    public Integer getDelayMinutes()     { return this.delayMinutes; }

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
    public void setTemperaturaMotor(Double temperaturaMotor) { this.temperaturaMotor = temperaturaMotor; }
    public void setNivelBateria(Double nivelBateria)         { this.nivelBateria = nivelBateria; }
    public void setStatusCarregador(String statusCarregador) { this.statusCarregador = statusCarregador; }
    public void setDelayMinutes(Integer delayMinutes)        { this.delayMinutes = delayMinutes; }

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
                ", temperaturaMotor=" + temperaturaMotor +
                ", nivelBateria=" + nivelBateria +
                ", statusCarregador='" + statusCarregador + '\'' +
                '}';
    }

}
