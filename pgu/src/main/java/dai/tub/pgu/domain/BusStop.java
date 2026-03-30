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

    @Column(nullable = false)
    private String display = "N/A";

    @Column(columnDefinition = "geometry(Point,4326)", nullable = false)
    private Point location;

    public BusStop() {}

    // GET
    public Long   getId()       { return this.id; }
    public String getName()     { return this.name; }
    public String getCode()     { return this.code; }
    public String getDisplay()  { return this.display; }
    public Point  getLocation() { return this.location; }

    // SET
    public void setId(Long id)             { this.id = id; }
    public void setName(String name)       { this.name = name; }
    public void setCode(String code)       { this.code = code; }
    public void setDisplay(String display)   { this.display = display; }
    public void setLocation(Point location) { this.location = location; }
}
