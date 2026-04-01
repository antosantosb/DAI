package dai.tub.pgu.dto;

public class StopEtaDTO
{
    private String routeCode;
    private String routeColor;
    private String busCode;
    private int etaMinutes;

    public StopEtaDTO() {}

    public StopEtaDTO(String routeCode, String routeColor, String busCode, int etaMinutes)
    {
        this.routeCode = routeCode;
        this.routeColor = routeColor;
        this.busCode = busCode;
        this.etaMinutes = etaMinutes;
    }

    // GET
    public String getRouteCode()  { return this.routeCode; }
    public String getRouteColor() { return this.routeColor; }
    public String getBusCode()    { return this.busCode; }
    public int    getEtaMinutes() { return this.etaMinutes; }

    // SET
    public void setRouteCode(String code)   { this.routeCode = code; }
    public void setRouteColor(String color) { this.routeColor = color; }
    public void setBusCode(String code)     { this.busCode = code; }
    public void setEtaMinutes(int minutes)  { this.etaMinutes = minutes; }
}
