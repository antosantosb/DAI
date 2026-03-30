package dai.tub.pgu.dto;

public class RouteStopDTO
{
    private Long stopId;
    private String stopName;
    private String stopCode;
    private Double latitude;
    private Double longitude;
    private Integer stopOrder;

    public RouteStopDTO() {}

    // GET
    public Long    getStopId()    { return this.stopId; }
    public String  getStopName()  { return this.stopName; }
    public String  getStopCode()  { return this.stopCode; }
    public Double  getLatitude()  { return this.latitude; }
    public Double  getLongitude() { return this.longitude; }
    public Integer getStopOrder() { return this.stopOrder; }

    // SET
    public void setStopId(Long id)            { this.stopId = id; }
    public void setStopName(String name)      { this.stopName = name; }
    public void setStopCode(String code)      { this.stopCode = code; }
    public void setLatitude(Double lat)       { this.latitude = lat; }
    public void setLongitude(Double lon)      { this.longitude = lon; }
    public void setStopOrder(Integer order)   { this.stopOrder = order; }
}
