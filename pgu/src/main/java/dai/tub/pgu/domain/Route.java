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

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "operator_id")
    private Operator operator;

    @OneToMany(mappedBy = "route", fetch = FetchType.LAZY)
    private List<Bus> buses = new ArrayList<>();

    public Route() {}

    // GET
    public Long            getId()         { return this.id; }
    public String          getName()       { return this.name; }
    public String          getCode()       { return this.code; }
    public String          getColor()      { return this.color; }
    public Operator        getOperator()   { return this.operator; }
    public List<Bus>       getBuses()      { return this.buses; }

    // SET
    public void setId(Long id)                        { this.id = id; }
    public void setName(String name)                  { this.name = name; }
    public void setCode(String code)                  { this.code = code; }
    public void setColor(String color)                { this.color = color; }
    public void setOperator(Operator operator)        { this.operator = operator; }
    public void setBuses(List<Bus> buses)             { this.buses = buses; }
}
