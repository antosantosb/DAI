package dai.tub.pgu.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "route_segments", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"route_id", "from_stop_order", "to_stop_order"})
})
public class RouteSegment
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "route_id", nullable = false)
    private Route route;

    @Column(name = "from_stop_order", nullable = false)
    private Integer fromStopOrder;

    @Column(name = "to_stop_order", nullable = false)
    private Integer toStopOrder;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private String points;

    public RouteSegment() {}

    // GET
    public Long    getId()            { return this.id; }
    public Route   getRoute()         { return this.route; }
    public Integer getFromStopOrder() { return this.fromStopOrder; }
    public Integer getToStopOrder()   { return this.toStopOrder; }
    public String  getPoints()        { return this.points; }

    // SET
    public void setId(Long id)                        { this.id = id; }
    public void setRoute(Route route)                 { this.route = route; }
    public void setFromStopOrder(Integer from)         { this.fromStopOrder = from; }
    public void setToStopOrder(Integer to)             { this.toStopOrder = to; }
    public void setPoints(String points)              { this.points = points; }
}
