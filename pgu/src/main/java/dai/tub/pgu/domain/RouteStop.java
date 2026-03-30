package dai.tub.pgu.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "route_stops", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"route_id", "stop_order"})
})
public class RouteStop
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "route_id", nullable = false)
    private Route route;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "stop_id", nullable = false)
    private BusStop stop;

    @Column(name = "stop_order", nullable = false)
    private Integer stopOrder;

    public RouteStop() {}

    // GET
    public Long    getId()        { return this.id; }
    public Route   getRoute()     { return this.route; }
    public BusStop getStop()      { return this.stop; }
    public Integer getStopOrder() { return this.stopOrder; }

    // SET
    public void setId(Long id)                { this.id = id; }
    public void setRoute(Route route)         { this.route = route; }
    public void setStop(BusStop stop)         { this.stop = stop; }
    public void setStopOrder(Integer order)   { this.stopOrder = order; }
}
