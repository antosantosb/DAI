package dai.tub.pgu.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import dai.tub.pgu.domain.VehicleSensor;

import java.time.Instant;
import java.util.Map;

/**
 * DTO publico do main sensor (gateway de telematica a bordo).
 *
 * <p>A localizacao e' exposta como lat/lon (a entidade guarda um Point 4326). O
 * {@code subsensorHealth} e' exposto como objecto JSON (Map) para o cliente, mas
 * persistido como texto JSON na entidade; a conversao texto<->Map e' feita aqui
 * para evitar a serializacao problematica de JsonNode em Spring Boot 4.
 *
 * <p>{@code busCode} e' denormalizado (codigo do autocarro atribuido) para o
 * frontend nao ter de fazer um segundo pedido; e' null quando o sensor esta'
 * livre ou quando o codigo nao foi resolvido. Campos extra enviados pelo cliente
 * sao ignorados.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class VehicleSensorDTO {

    // ObjectMapper partilhado e thread-safe; so' para conversao do JSON dos
    // sub-sensores (texto <-> Map).
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP_TYPE =
            new TypeReference<Map<String, Object>>() {};

    private Long id;
    private String gateway;
    private Long busId;
    private String busCode;
    // Estado do autocarro atribuido (ex.: STOPPED, ACTIVE, STOPPING); null quando
    // o sensor esta' livre ou o autocarro nao foi resolvido. Permite ao frontend
    // aplicar a regra do motorista: editar/eliminar/libertar so' com bus STOPPED.
    private String busStatus;
    private String doorPosition;
    private String status;
    private Map<String, Object> subsensorHealth;
    private Instant lastReadingAt;
    private Instant lastReading;
    private Double latitude;
    private Double longitude;
    private Instant createdAt;
    private Instant updatedAt;

    public VehicleSensorDTO() {}

    /** Constroi o DTO sem resolver o autocarro (busCode/busStatus ficam null). */
    public static VehicleSensorDTO from(VehicleSensor s) {
        return from(s, null, null);
    }

    /** Constroi o DTO com o codigo do autocarro atribuido (busStatus fica null). */
    public static VehicleSensorDTO from(VehicleSensor s, String busCode) {
        return from(s, busCode, null);
    }

    /**
     * Constroi o DTO com codigo e estado do autocarro atribuido (ambos podem ser
     * null quando o sensor esta' livre). O {@code busStatus} alimenta a regra do
     * motorista no frontend (bloquear so' com o autocarro nao-STOPPED).
     */
    public static VehicleSensorDTO from(VehicleSensor s, String busCode, String busStatus) {
        VehicleSensorDTO dto = new VehicleSensorDTO();
        dto.id = s.getId();
        dto.gateway = s.getGateway();
        dto.busId = s.getBusId();
        dto.busCode = busCode;
        dto.busStatus = busStatus;
        dto.doorPosition = s.getDoorPosition();
        dto.status = s.getStatus();
        dto.subsensorHealth = parseJson(s.getSubsensorHealth());
        dto.lastReadingAt = s.getLastReadingAt();
        dto.lastReading = s.getLastReading();
        if (s.getLocation() != null) {
            dto.longitude = s.getLocation().getX();
            dto.latitude = s.getLocation().getY();
        }
        dto.createdAt = s.getCreatedAt();
        dto.updatedAt = s.getUpdatedAt();
        return dto;
    }

    // Texto JSON -> Map (null/invalido -> null, best-effort para nao partir reads).
    private static Map<String, Object> parseJson(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return JSON.readValue(raw, MAP_TYPE);
        } catch (Exception e) {
            return null;
        }
    }

    // Map -> texto JSON, para persistir o que o cliente enviou (null -> null).
    public String subsensorHealthAsJson() {
        if (this.subsensorHealth == null) return null;
        try {
            return JSON.writeValueAsString(this.subsensorHealth);
        } catch (Exception e) {
            return null;
        }
    }

    // GET
    public Long                getId()              { return this.id; }
    public String              getGateway()         { return this.gateway; }
    public Long                getBusId()           { return this.busId; }
    public String              getBusCode()         { return this.busCode; }
    public String              getBusStatus()       { return this.busStatus; }
    public String              getDoorPosition()    { return this.doorPosition; }
    public String              getStatus()          { return this.status; }
    public Map<String, Object> getSubsensorHealth() { return this.subsensorHealth; }
    public Instant             getLastReadingAt()   { return this.lastReadingAt; }
    public Instant             getLastReading()     { return this.lastReading; }
    public Double              getLatitude()        { return this.latitude; }
    public Double              getLongitude()       { return this.longitude; }
    public Instant             getCreatedAt()       { return this.createdAt; }
    public Instant             getUpdatedAt()       { return this.updatedAt; }

    // SET
    public void setId(Long id)                                    { this.id = id; }
    public void setGateway(String gateway)                        { this.gateway = gateway; }
    public void setBusId(Long busId)                              { this.busId = busId; }
    public void setBusCode(String busCode)                        { this.busCode = busCode; }
    public void setBusStatus(String busStatus)                    { this.busStatus = busStatus; }
    public void setDoorPosition(String doorPosition)              { this.doorPosition = doorPosition; }
    public void setStatus(String status)                          { this.status = status; }
    public void setSubsensorHealth(Map<String, Object> health)    { this.subsensorHealth = health; }
    public void setLastReadingAt(Instant lastReadingAt)           { this.lastReadingAt = lastReadingAt; }
    public void setLastReading(Instant lastReading)               { this.lastReading = lastReading; }
    public void setLatitude(Double latitude)                      { this.latitude = latitude; }
    public void setLongitude(Double longitude)                    { this.longitude = longitude; }
    public void setCreatedAt(Instant createdAt)                   { this.createdAt = createdAt; }
    public void setUpdatedAt(Instant updatedAt)                   { this.updatedAt = updatedAt; }
}
