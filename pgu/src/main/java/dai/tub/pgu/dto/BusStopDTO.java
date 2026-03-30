package dai.tub.pgu.dto;

public class BusStopDTO
{
    private Long id;
    private String name;
    private String code;
    private String display;
    private Double latitude;
    private Double longitude;

    public BusStopDTO() {}

    // GET
    public Long   getId()        { return this.id; }
    public String getName()      { return this.name; }
    public String getCode()      { return this.code; }
    public String getDisplay()   { return this.display; }
    public Double getLatitude()  { return this.latitude; }
    public Double getLongitude() { return this.longitude; }

    // SET
    public void setId(Long id)               { this.id = id; }
    public void setName(String name)         { this.name = name; }
    public void setCode(String code)         { this.code = code; }
    public void setDisplay(String display)   { this.display = display; }
    public void setLatitude(Double lat)      { this.latitude = lat; }
    public void setLongitude(Double lon)     { this.longitude = lon; }
}
