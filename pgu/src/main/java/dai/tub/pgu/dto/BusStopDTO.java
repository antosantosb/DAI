package dai.tub.pgu.dto;

public class BusStopDTO
{
    private Long id;
    private String name;
    private String code;
    private Integer maxBusesDisplay;
    private String panelMessage;
    private Double latitude;
    private Double longitude;

    public BusStopDTO() {}

    // GET
    public Long   getId()        { return this.id; }
    public String getName()      { return this.name; }
    public String getCode()      { return this.code; }
    public Integer getMaxBusesDisplay() { return this.maxBusesDisplay; }
    public String  getPanelMessage()   { return this.panelMessage; }
    public Double getLatitude()  { return this.latitude; }
    public Double getLongitude() { return this.longitude; }

    // SET
    public void setId(Long id)               { this.id = id; }
    public void setName(String name)         { this.name = name; }
    public void setCode(String code)         { this.code = code; }
    public void setMaxBusesDisplay(Integer max) { this.maxBusesDisplay = max; }
    public void setPanelMessage(String msg)    { this.panelMessage = msg; }
    public void setLatitude(Double lat)      { this.latitude = lat; }
    public void setLongitude(Double lon)     { this.longitude = lon; }
}
