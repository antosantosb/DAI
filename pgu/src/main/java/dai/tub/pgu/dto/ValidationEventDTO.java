package dai.tub.pgu.dto;

import java.time.OffsetDateTime;

/**
 * Sprint 2 (fundacao de bilhetica): payload de um evento de validacao recebido
 * em {@code POST /api/v1/validations}.
 *
 * <p>Nesta fundacao o evento NAO e' persistido nem processado: o controller
 * apenas faz log. O Sprint 5 e que ingere, valida e agrega (transbordos,
 * preco por coroa). Campos opcionais conforme o canal (TAP nao traz destino;
 * CHECK_OUT traz local de chegada).
 */
public class ValidationEventDTO
{
    private Long           ticketId;
    private String         eventType;   // TAP, CHECK_IN, CHECK_OUT
    private String         busId;
    private Long           routeId;
    private Long           stopId;
    private Double         latitude;    // WGS84
    private Double         longitude;   // WGS84
    private OffsetDateTime validatedAt;
    private String         source;      // CARD, BORDO, APP
    private String         rawPayload;  // evento bruto (JSON em texto), opcional

    public ValidationEventDTO() {}

    // GET
    public Long           getTicketId()    { return this.ticketId; }
    public String         getEventType()   { return this.eventType; }
    public String         getBusId()       { return this.busId; }
    public Long           getRouteId()     { return this.routeId; }
    public Long           getStopId()      { return this.stopId; }
    public Double         getLatitude()    { return this.latitude; }
    public Double         getLongitude()   { return this.longitude; }
    public OffsetDateTime getValidatedAt() { return this.validatedAt; }
    public String         getSource()      { return this.source; }
    public String         getRawPayload()  { return this.rawPayload; }

    // SET
    public void setTicketId(Long ticketId)                 { this.ticketId = ticketId; }
    public void setEventType(String eventType)             { this.eventType = eventType; }
    public void setBusId(String busId)                     { this.busId = busId; }
    public void setRouteId(Long routeId)                   { this.routeId = routeId; }
    public void setStopId(Long stopId)                     { this.stopId = stopId; }
    public void setLatitude(Double latitude)               { this.latitude = latitude; }
    public void setLongitude(Double longitude)             { this.longitude = longitude; }
    public void setValidatedAt(OffsetDateTime validatedAt) { this.validatedAt = validatedAt; }
    public void setSource(String source)                   { this.source = source; }
    public void setRawPayload(String rawPayload)           { this.rawPayload = rawPayload; }
}
