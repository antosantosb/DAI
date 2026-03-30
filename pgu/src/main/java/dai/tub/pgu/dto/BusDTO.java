package dai.tub.pgu.dto;

public class BusDTO
{
    private Long id;
    private String busCode;
    private String licensePlate;
    private Integer capacity;
    private Long routeId;
    private String routeCode;
    private String routeName;
    private String status;

    public BusDTO() {}

    // GET
    public Long    getId()           { return this.id; }
    public String  getBusCode()      { return this.busCode; }
    public String  getLicensePlate() { return this.licensePlate; }
    public Integer getCapacity()     { return this.capacity; }
    public Long    getRouteId()      { return this.routeId; }
    public String  getRouteCode()    { return this.routeCode; }
    public String  getRouteName()    { return this.routeName; }
    public String  getStatus()       { return this.status; }

    // SET
    public void setId(Long id)                     { this.id = id; }
    public void setBusCode(String busCode)         { this.busCode = busCode; }
    public void setLicensePlate(String plate)      { this.licensePlate = plate; }
    public void setCapacity(Integer capacity)      { this.capacity = capacity; }
    public void setRouteId(Long routeId)           { this.routeId = routeId; }
    public void setRouteCode(String routeCode)     { this.routeCode = routeCode; }
    public void setRouteName(String routeName)     { this.routeName = routeName; }
    public void setStatus(String status)           { this.status = status; }
}
