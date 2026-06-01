package dai.tub.pgu.domain;

import java.time.OffsetDateTime;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

import jakarta.persistence.*;

/**
 * Sprint 2 (fundacao de bilhetica): evento de validacao (uma linha por evento).
 *
 * <p>{@code eventType}: TAP (cartao/bordo, so tap-in) ou CHECK_IN / CHECK_OUT
 * (app TUBmobile). Validacoes do mesmo titulo na mesma hora agregam numa
 * viagem com transbordos (logica do Sprint 5, nao desta fundacao).
 * {@code rawPayload} guarda o evento bruto recebido, para auditoria.
 *
 * <p>A geometria {@code location} e' um JTS {@link Point} WGS84 (SRID 4326),
 * o mesmo tipo usado por {@code BusStop}.
 *
 * <p>Compativel com o Smart Data Model {@code TransitTrip} da FIWARE (uma
 * viagem com transbordos mapeia para um TransitTrip; cada evento e' uma
 * validacao).
 *
 * <p>Schema em {@code db/migration/V49__ticketing_foundation.sql}.
 */
@Entity
@Table(name = "validation_event")
public class ValidationEvent
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // FK opcional para ticket(id). Coluna simples (so o id) nesta fundacao.
    @Column(name = "ticket_id")
    private Long ticketId;

    // TAP, CHECK_IN, CHECK_OUT.
    @Column(name = "event_type", nullable = false, length = 16)
    private String eventType;

    @Column(name = "bus_id", length = 32)
    private String busId;

    @Column(name = "route_id")
    private Long routeId;

    @Column(name = "stop_id")
    private Long stopId;

    @Column(columnDefinition = "geometry(Point,4326)")
    private Point location;

    @Column(name = "validated_at", nullable = false)
    private OffsetDateTime validatedAt;

    // CARD, BORDO, APP.
    @Column(length = 16)
    private String source;

    // Evento bruto recebido (auditoria). Coluna JSONB na DB; mapeada como String
    // por agora (nao ha processamento nesta fundacao). O Sprint 5 podera trocar
    // por @JdbcTypeCode(SqlTypes.JSON) quando processar o conteudo.
    // @JdbcTypeCode(SqlTypes.JSON) faz Hibernate enviar a String com cast::jsonb
    // (em vez de varchar puro). Sem isto, a INSERT explodia com
    // "column raw_payload is of type jsonb but expression is of type character varying".
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_payload", columnDefinition = "jsonb")
    private String rawPayload;

    public ValidationEvent() {}

    // GET
    public Long           getId()          { return this.id; }
    public Long           getTicketId()    { return this.ticketId; }
    public String         getEventType()   { return this.eventType; }
    public String         getBusId()       { return this.busId; }
    public Long           getRouteId()     { return this.routeId; }
    public Long           getStopId()      { return this.stopId; }
    public Point          getLocation()    { return this.location; }
    public OffsetDateTime getValidatedAt() { return this.validatedAt; }
    public String         getSource()      { return this.source; }
    public String         getRawPayload()  { return this.rawPayload; }

    // SET
    public void setId(Long id)                          { this.id = id; }
    public void setTicketId(Long ticketId)              { this.ticketId = ticketId; }
    public void setEventType(String eventType)          { this.eventType = eventType; }
    public void setBusId(String busId)                  { this.busId = busId; }
    public void setRouteId(Long routeId)                { this.routeId = routeId; }
    public void setStopId(Long stopId)                  { this.stopId = stopId; }
    public void setLocation(Point location)             { this.location = location; }
    public void setValidatedAt(OffsetDateTime validatedAt) { this.validatedAt = validatedAt; }
    public void setSource(String source)                { this.source = source; }
    public void setRawPayload(String rawPayload)        { this.rawPayload = rawPayload; }
}
