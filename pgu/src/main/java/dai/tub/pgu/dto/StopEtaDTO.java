package dai.tub.pgu.dto;

public class StopEtaDTO
{
    private String routeCode;
    private String routeColor;
    private String busCode;
    private int etaMinutes;

    // Sprint 5 (follow-up): horario scheduled da trip (HH:mm) e atraso em
    // minutos. delayMinutes pode ser negativo (adiantado). Null quando o
    // bus nao tem duty activo (ex.: simulacao fora de escala).
    private String scheduledArrival;
    private Integer delayMinutes;
    private Long tripId;

    public StopEtaDTO() {}

    public StopEtaDTO(String routeCode, String routeColor, String busCode, int etaMinutes)
    {
        this.routeCode = routeCode;
        this.routeColor = routeColor;
        this.busCode = busCode;
        this.etaMinutes = etaMinutes;
    }

    public StopEtaDTO(String routeCode, String routeColor, String busCode, int etaMinutes,
                       String scheduledArrival, Integer delayMinutes, Long tripId)
    {
        this(routeCode, routeColor, busCode, etaMinutes);
        this.scheduledArrival = scheduledArrival;
        this.delayMinutes = delayMinutes;
        this.tripId = tripId;
    }

    // GET
    public String  getRouteCode()        { return this.routeCode; }
    public String  getRouteColor()       { return this.routeColor; }
    public String  getBusCode()          { return this.busCode; }
    public int     getEtaMinutes()       { return this.etaMinutes; }
    public String  getScheduledArrival() { return this.scheduledArrival; }
    public Integer getDelayMinutes()     { return this.delayMinutes; }
    public Long    getTripId()           { return this.tripId; }

    // SET
    public void setRouteCode(String code)              { this.routeCode = code; }
    public void setRouteColor(String color)            { this.routeColor = color; }
    public void setBusCode(String code)                { this.busCode = code; }
    public void setEtaMinutes(int minutes)             { this.etaMinutes = minutes; }
    public void setScheduledArrival(String s)          { this.scheduledArrival = s; }
    public void setDelayMinutes(Integer m)             { this.delayMinutes = m; }
    public void setTripId(Long id)                     { this.tripId = id; }
}
