package dai.tub.pgu.domain;

import jakarta.persistence.*;
import org.locationtech.jts.geom.Point;

@Entity
@Table(name = "bus_stops")
public class BusStop
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(unique = true, nullable = false)
    private String code;

    @Column(name = "max_buses_display", nullable = false)
    private Integer maxBusesDisplay = 3;

    @Column(name = "panel_message")
    private String panelMessage;

    @Column(columnDefinition = "geometry(Point,4326)", nullable = false)
    private Point location;

    public BusStop() {}

    // GET
    public Long   getId()       { return this.id; }
    public String getName()     { return this.name; }
    public String getCode()     { return this.code; }
    public Integer getMaxBusesDisplay() { return this.maxBusesDisplay; }
    public String  getPanelMessage()   { return this.panelMessage; }
    public Point  getLocation() { return this.location; }

    // SET
    public void setId(Long id)             { this.id = id; }
    public void setName(String name)       { this.name = name; }
    public void setCode(String code)       { this.code = code; }
    public void setMaxBusesDisplay(Integer max) { this.maxBusesDisplay = max; }
    public void setPanelMessage(String msg)    { this.panelMessage = msg; }
    public void setLocation(Point location) { this.location = location; }
}
