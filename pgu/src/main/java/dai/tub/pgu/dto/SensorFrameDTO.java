package dai.tub.pgu.dto;

import java.time.Instant;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Fase C (Passo 1): frame de telemetria identificado pelo MAIN SENSOR.
 *
 * <p>Contrato NOVO que o NiFi/simulador envia. Ao contrario do {@link TelemetryDTO}
 * (que e' identificado pelo codigo do autocarro), este frame e' identificado pelo
 * {@code sensorId} (o codigo do gateway/main sensor a bordo). O backend resolve o
 * autocarro pela atribuicao sensor->bus ({@code vehicle_sensor.bus_id}).
 *
 * <p>O frame agrega a posicao do veiculo e o bloco de sub-sensores, cada um com
 * valor e saude (0..1):
 * <pre>
 * {
 *   "sensorId": "GW-0001",
 *   "lat": 41.5454,
 *   "lon": -8.4265,
 *   "speed": 32.4,
 *   "timestamp": "2026-05-30T10:15:00Z",
 *   "subsensors": {
 *     "rpm":         { "value": 1850.0, "health": 0.98 },
 *     "bateria":     { "value": 87.0,   "health": 0.95 },
 *     "km":          { "value": 154320.0, "health": 1.0 },
 *     "passageiros": { "boarded": 3, "alighted": 1, "onboard": 18, "health": 0.99 },
 *     "gps":         { "health": 0.97 }
 *   }
 * }
 * </pre>
 *
 * <p>Campos extra sao ignorados (tolerancia a evolucao do produtor).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class SensorFrameDTO {

    // Codigo do gateway/main sensor que reporta este frame. Chave de resolucao
    // do autocarro (vehicle_sensor.gateway -> vehicle_sensor.bus_id).
    private String sensorId;

    // Compatibilidade: se o produtor antigo enviar busId (codigo do autocarro) e
    // nao sensorId, a ingestao cai no caminho legado keyed por autocarro.
    private String busId;

    // Posicao e cinematica do veiculo.
    private Double lat;
    private Double lon;
    private Double speed;

    // Instante da leitura (opcional; se ausente usa-se "agora" na ingestao).
    private Instant timestamp;

    // Estado opcional reportado pelo veiculo (segue o caminho legado de status).
    private String status;

    // Bloco de sub-sensores. Cada chave (rpm, bateria, km, passageiros, gps)
    // aponta para um objecto com valor e/ou saude. Mantido como Map para nao
    // acoplar o contrato a uma classe rigida e tolerar campos novos.
    private Map<String, SubSensor> subsensors;

    public SensorFrameDTO() {}

    // GET
    public String  getSensorId()  { return this.sensorId; }
    public String  getBusId()     { return this.busId; }
    public Double  getLat()       { return this.lat; }
    public Double  getLon()       { return this.lon; }
    public Double  getSpeed()     { return this.speed; }
    public Instant getTimestamp() { return this.timestamp; }
    public String  getStatus()    { return this.status; }
    public Map<String, SubSensor> getSubsensors() { return this.subsensors; }

    // SET
    public void setSensorId(String sensorId)   { this.sensorId = sensorId; }
    public void setBusId(String busId)         { this.busId = busId; }
    public void setLat(Double lat)             { this.lat = lat; }
    public void setLon(Double lon)             { this.lon = lon; }
    public void setSpeed(Double speed)         { this.speed = speed; }
    public void setTimestamp(Instant timestamp){ this.timestamp = timestamp; }
    public void setStatus(String status)       { this.status = status; }
    public void setSubsensors(Map<String, SubSensor> subsensors) { this.subsensors = subsensors; }


    /**
     * Leitura de um sub-sensor. Campos opcionais (Integer/Double nullable) para
     * acomodar sub-sensores que so' reportam saude (ex.: gps) e o sub-sensor de
     * passageiros que traz a contagem APC (boarded/alighted/onboard).
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SubSensor {
        // Valor generico do sub-sensor (rpm, percentagem de bateria, km, ...).
        private Double value;
        // Saude do sub-sensor, 0..1 (1 = saudavel, 0 = avariado).
        private Double health;
        // APC (apenas no sub-sensor "passageiros").
        private Integer boarded;
        private Integer alighted;
        private Integer onboard;

        public SubSensor() {}

        public Double  getValue()    { return this.value; }
        public Double  getHealth()   { return this.health; }
        public Integer getBoarded()  { return this.boarded; }
        public Integer getAlighted() { return this.alighted; }
        public Integer getOnboard()  { return this.onboard; }

        public void setValue(Double value)       { this.value = value; }
        public void setHealth(Double health)     { this.health = health; }
        public void setBoarded(Integer boarded)  { this.boarded = boarded; }
        public void setAlighted(Integer alighted){ this.alighted = alighted; }
        public void setOnboard(Integer onboard)  { this.onboard = onboard; }
    }
}
