package dai.tub.pgu.dto;

import java.time.Instant;

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
    // Fase E: instante em que o autocarro foi descomissionado (null se ativo).
    private Instant decommissionedAt;
    // Linha actual derivada da escala (1a duty PLANNED/RUNNING de hoje):
    // permite ao frontend mostrar a linha do servico actual mesmo sem
    // o autocarro ter `routeId` (que ja' nao e' propriedade do bus).
    private String currentRouteCode;
    private String currentRouteName;

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
    public Instant getDecommissionedAt() { return this.decommissionedAt; }
    public String  getCurrentRouteCode() { return this.currentRouteCode; }
    public String  getCurrentRouteName() { return this.currentRouteName; }

    // SET
    public void setId(Long id)                     { this.id = id; }
    public void setBusCode(String busCode)         { this.busCode = busCode; }
    public void setLicensePlate(String plate)      { this.licensePlate = plate; }
    public void setCapacity(Integer capacity)      { this.capacity = capacity; }
    public void setRouteId(Long routeId)           { this.routeId = routeId; }
    public void setRouteCode(String routeCode)     { this.routeCode = routeCode; }
    public void setRouteName(String routeName)     { this.routeName = routeName; }
    public void setStatus(String status)           { this.status = status; }
    public void setDecommissionedAt(Instant when)  { this.decommissionedAt = when; }
    public void setCurrentRouteCode(String code)   { this.currentRouteCode = code; }
    public void setCurrentRouteName(String name)   { this.currentRouteName = name; }
}
