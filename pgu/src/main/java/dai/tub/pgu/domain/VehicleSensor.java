package dai.tub.pgu.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

import java.time.Instant;

/**
 * Inventario do MAIN SENSOR (gateway de telematica a bordo), um por autocarro.
 *
 * <p>Cada main sensor e' o dispositivo de bordo que agrega os varios sub-sensores
 * do veiculo (rpm, bateria, km, passageiros, gps), cada um com valor e saude
 * (0..1). Ha uma linha de inventario por main sensor. O link ao autocarro e'
 * opcional: um sensor pode estar "livre" (em stock/manutencao, bus_id null) ou
 * atribuido a um autocarro existente.
 *
 * <p>Guarda estado, snapshot de saude dos sub-sensores (JSON), instante da ultima
 * leitura agregada e localizacao (Point 4326, coerente com bus_stops/
 * vehicle_telemetry, tipicamente a posicao da garagem/oficina ou da ultima
 * leitura conhecida).
 *
 * <p>Schema inicial em {@code db/migration/V46__create_passenger_sensor.sql},
 * renomeado e estendido em
 * {@code db/migration/V50__rename_passenger_sensor_to_vehicle_sensor.sql}.
 */
@Entity
@Table(name = "vehicle_sensor")
public class VehicleSensor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Identificador do gateway/main sensor (codigo de inventario do dispositivo).
    @Column(name = "gateway", nullable = false, length = 64)
    private String gateway;

    // FK opcional para buses.id (ON DELETE SET NULL na migracao). Mapeado como
    // valor simples (Long) para manter o CRUD leve e desacoplado da entidade Bus.
    // null = sensor livre (sem autocarro atribuido).
    @Column(name = "bus_id")
    private Long busId;

    // Posicao de montagem a bordo (legado da V46: FRONT/MIDDLE/REAR). Mantido por
    // compatibilidade; num main sensor unico por autocarro tipicamente e' FRONT.
    @Column(name = "door_position", nullable = false, length = 16)
    private String doorPosition = "FRONT";

    // Estado do main sensor. Novo modelo (V50): default 'ATIVO'. Outros valores
    // possiveis: INATIVO, AVARIA, DESCONHECIDO.
    @Column(name = "status", nullable = false, length = 32)
    private String status = "ATIVO";

    // Snapshot JSON dos sub-sensores: cada chave (rpm, bateria, km, passageiros,
    // gps) aponta para um objecto com valor e saude (0..1). Guardado como texto
    // JSON (jsonb na BD) para evitar a serializacao problematica de JsonNode em
    // Spring Boot 4; o DTO converte para Map para o cliente.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "subsensor_health", columnDefinition = "jsonb")
    private String subsensorHealth;

    // Instante da ultima leitura agregada do main sensor (novo modelo, V50).
    @Column(name = "last_reading_at")
    private Instant lastReadingAt;

    // Legado da V46: timestamp da ultima leitura individual. Mantido por
    // compatibilidade de schema; last_reading_at e' o campo canonico do main sensor.
    @Column(name = "last_reading")
    private Instant lastReading;

    @Column(name = "location", columnDefinition = "geometry(Point,4326)")
    private Point location;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public VehicleSensor() {}

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    // GET
    public Long    getId()              { return this.id; }
    public String  getGateway()         { return this.gateway; }
    public Long    getBusId()           { return this.busId; }
    public String  getDoorPosition()    { return this.doorPosition; }
    public String  getStatus()          { return this.status; }
    public String  getSubsensorHealth() { return this.subsensorHealth; }
    public Instant getLastReadingAt()   { return this.lastReadingAt; }
    public Instant getLastReading()     { return this.lastReading; }
    public Point   getLocation()        { return this.location; }
    public Instant getCreatedAt()       { return this.createdAt; }
    public Instant getUpdatedAt()       { return this.updatedAt; }

    // SET
    public void setId(Long id)                            { this.id = id; }
    public void setGateway(String gateway)                { this.gateway = gateway; }
    public void setBusId(Long busId)                      { this.busId = busId; }
    public void setDoorPosition(String doorPosition)      { this.doorPosition = doorPosition; }
    public void setStatus(String status)                  { this.status = status; }
    public void setSubsensorHealth(String subsensorHealth){ this.subsensorHealth = subsensorHealth; }
    public void setLastReadingAt(Instant lastReadingAt)   { this.lastReadingAt = lastReadingAt; }
    public void setLastReading(Instant lastReading)       { this.lastReading = lastReading; }
    public void setLocation(Point location)               { this.location = location; }
    public void setCreatedAt(Instant createdAt)           { this.createdAt = createdAt; }
    public void setUpdatedAt(Instant updatedAt)           { this.updatedAt = updatedAt; }
}
