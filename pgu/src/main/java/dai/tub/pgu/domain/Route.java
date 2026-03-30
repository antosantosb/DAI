package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "routes")
public class Route
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(unique = true, nullable = false)
    private String code;

    @Column
    private String color;

    @OneToMany(mappedBy = "route", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("stopOrder ASC")
    private List<RouteStop> routeStops = new ArrayList<>();

    @OneToMany(mappedBy = "route", fetch = FetchType.EAGER)
    private List<Bus> buses = new ArrayList<>();

    public Route() {}

    // GET
    public Long            getId()         { return this.id; }
    public String          getName()       { return this.name; }
    public String          getCode()       { return this.code; }
    public String          getColor()      { return this.color; }
    public List<RouteStop> getRouteStops() { return this.routeStops; }
    public List<Bus>       getBuses()      { return this.buses; }

    // SET
    public void setId(Long id)                        { this.id = id; }
    public void setName(String name)                  { this.name = name; }
    public void setCode(String code)                  { this.code = code; }
    public void setColor(String color)                { this.color = color; }
    public void setRouteStops(List<RouteStop> stops)  { this.routeStops = stops; }
    public void setBuses(List<Bus> buses)             { this.buses = buses; }
}
