package dai.tub.pgu.dto;

public class StopScheduleDTO
{
    private Long id;
    private Long routeId;
    private String routeCode;
    private String routeColor;
    private Long stopId;
    private String stopName;
    private String stopCode;
    private String tripId;
    private String arrivalTime;
    private String departureTime;
    private Integer stopSequence;
    private Integer directionId;
    private String serviceId;

    public StopScheduleDTO() {}

    // GET
    public Long    getId()            { return this.id; }
    public Long    getRouteId()       { return this.routeId; }
    public String  getRouteCode()     { return this.routeCode; }
    public String  getRouteColor()    { return this.routeColor; }
    public Long    getStopId()        { return this.stopId; }
    public String  getStopName()      { return this.stopName; }
    public String  getStopCode()      { return this.stopCode; }
    public String  getTripId()        { return this.tripId; }
    public String  getArrivalTime()   { return this.arrivalTime; }
    public String  getDepartureTime() { return this.departureTime; }
    public Integer getStopSequence()  { return this.stopSequence; }
    public Integer getDirectionId()   { return this.directionId; }
    public String  getServiceId()     { return this.serviceId; }

    // SET
    public void setId(Long id)                     { this.id = id; }
    public void setRouteId(Long routeId)           { this.routeId = routeId; }
    public void setRouteCode(String code)          { this.routeCode = code; }
    public void setRouteColor(String color)        { this.routeColor = color; }
    public void setStopId(Long stopId)             { this.stopId = stopId; }
    public void setStopName(String name)           { this.stopName = name; }
    public void setStopCode(String code)           { this.stopCode = code; }
    public void setTripId(String tripId)           { this.tripId = tripId; }
    public void setArrivalTime(String time)        { this.arrivalTime = time; }
    public void setDepartureTime(String time)      { this.departureTime = time; }
    public void setStopSequence(Integer seq)       { this.stopSequence = seq; }
    public void setDirectionId(Integer dir)        { this.directionId = dir; }
    public void setServiceId(String sid)           { this.serviceId = sid; }
}
