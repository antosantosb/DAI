package dai.tub.pgu.dto;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Fase E (E-back-1): vista denormalizada de uma linha de bus_duty.
 *
 * Inclui campos legiveis (busCode, routeShortName, tripHeadsign) para o UI
 * nao precisar de N pedidos extra; sao copiados do agregado no service ao
 * construir o DTO.
 */
public class BusDutyDTO
{
    private Long id;
    private Long busId;
    private String busCode;
    private Long tripId;
    private String tripHeadsign;       // legivel (Trip.headsign), pode ser null
    private String tripDisplayName;    // fallback: gtfsTripId ou "trip #id"
    private String routeShortName;     // Route.code (ex.: "1", "12")
    private String routeName;          // Route.name (ex.: "Estadio - Cabreiros")
    private Long patternId;
    private LocalDate serviceDate;
    private Integer sequence;
    private Instant plannedStart;
    private Instant plannedEnd;        // hora de chegada (ultima paragem da trip)
    private String status;             // PLANNED | RUNNING | DONE | CANCELLED | INTERRUPTED

    public BusDutyDTO() {}

    public Long      getId()              { return this.id; }
    public Long      getBusId()           { return this.busId; }
    public String    getBusCode()         { return this.busCode; }
    public Long      getTripId()          { return this.tripId; }
    public String    getTripHeadsign()    { return this.tripHeadsign; }
    public String    getTripDisplayName() { return this.tripDisplayName; }
    public String    getRouteShortName()  { return this.routeShortName; }
    public String    getRouteName()       { return this.routeName; }
    public Long      getPatternId()       { return this.patternId; }
    public LocalDate getServiceDate()     { return this.serviceDate; }
    public Integer   getSequence()        { return this.sequence; }
    public Instant   getPlannedStart()    { return this.plannedStart; }
    public Instant   getPlannedEnd()      { return this.plannedEnd; }
    public String    getStatus()          { return this.status; }

    public void setId(Long id)                       { this.id = id; }
    public void setBusId(Long busId)                 { this.busId = busId; }
    public void setBusCode(String busCode)           { this.busCode = busCode; }
    public void setTripId(Long tripId)               { this.tripId = tripId; }
    public void setTripHeadsign(String headsign)     { this.tripHeadsign = headsign; }
    public void setTripDisplayName(String name)      { this.tripDisplayName = name; }
    public void setRouteShortName(String code)       { this.routeShortName = code; }
    public void setRouteName(String name)            { this.routeName = name; }
    public void setPatternId(Long patternId)         { this.patternId = patternId; }
    public void setServiceDate(LocalDate date)       { this.serviceDate = date; }
    public void setSequence(Integer sequence)        { this.sequence = sequence; }
    public void setPlannedStart(Instant plannedStart){ this.plannedStart = plannedStart; }
    public void setPlannedEnd(Instant plannedEnd)    { this.plannedEnd = plannedEnd; }
    public void setStatus(String status)             { this.status = status; }
}
