package dai.tub.pgu.dto;

import java.util.List;

public class RouteSegmentDTO
{
    private Long id;
    private Long routeId;
    private Integer fromStopOrder;
    private Integer toStopOrder;
    private List<List<Double>> points;  // [[lat, lon], ...]

    // GET
    public Long              getId()            { return this.id; }
    public Long              getRouteId()       { return this.routeId; }
    public Integer           getFromStopOrder() { return this.fromStopOrder; }
    public Integer           getToStopOrder()   { return this.toStopOrder; }
    public List<List<Double>> getPoints()       { return this.points; }

    // SET
    public void setId(Long id)                              { this.id = id; }
    public void setRouteId(Long routeId)                    { this.routeId = routeId; }
    public void setFromStopOrder(Integer from)               { this.fromStopOrder = from; }
    public void setToStopOrder(Integer to)                   { this.toStopOrder = to; }
    public void setPoints(List<List<Double>> points)        { this.points = points; }
}
