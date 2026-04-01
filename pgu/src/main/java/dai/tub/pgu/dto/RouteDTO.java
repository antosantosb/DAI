package dai.tub.pgu.dto;

import java.util.List;

public class RouteDTO
{
    private Long id;
    private String name;
    private String code;
    private String color;
    private List<RouteStopDTO> stops;
    private List<List<Double>> shapePoints;

    public RouteDTO() {}

    // GET
    public Long              getId()    { return this.id; }
    public String            getName()  { return this.name; }
    public String            getCode()  { return this.code; }
    public String            getColor() { return this.color; }
    public List<RouteStopDTO> getStops() { return this.stops; }
    public List<List<Double>> getShapePoints() { return this.shapePoints; }

    // SET
    public void setId(Long id)                      { this.id = id; }
    public void setName(String name)                { this.name = name; }
    public void setCode(String code)                { this.code = code; }
    public void setColor(String color)              { this.color = color; }
    public void setStops(List<RouteStopDTO> stops)  { this.stops = stops; }
    public void setShapePoints(List<List<Double>> shapePoints) { this.shapePoints = shapePoints; }
}
