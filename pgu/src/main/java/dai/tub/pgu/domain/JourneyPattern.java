package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * Sprint 1 (Fase 1): JourneyPattern (Transmodel) — uma sequencia distinta de
 * paragens de uma linha (o "canal"). Uma linha tem tipicamente 3 a 5 padroes.
 * As trips apontam para o seu padrao; a geometria vive em PatternSegment.
 */
@Entity
@Table(name = "journey_pattern", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"route_id", "signature"})
})
public class JourneyPattern
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "route_id", nullable = false)
    private Route route;

    @Column(name = "direction_id", nullable = false)
    private Integer directionId = 0;

    @Column(nullable = false, length = 64)
    private String signature;

    @Column
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "gtfs_import_id")
    private GtfsImport gtfsImport;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    public JourneyPattern() {}

    // GET
    public Long       getId()          { return this.id; }
    public Route      getRoute()       { return this.route; }
    public Integer    getDirectionId() { return this.directionId; }
    public String     getSignature()   { return this.signature; }
    public String     getName()        { return this.name; }
    public GtfsImport getGtfsImport()  { return this.gtfsImport; }
    public Instant    getCreatedAt()   { return this.createdAt; }

    // SET
    public void setId(Long id)                 { this.id = id; }
    public void setRoute(Route route)          { this.route = route; }
    public void setDirectionId(Integer dir)    { this.directionId = dir; }
    public void setSignature(String signature) { this.signature = signature; }
    public void setName(String name)           { this.name = name; }
    public void setGtfsImport(GtfsImport imp)  { this.gtfsImport = imp; }
    public void setCreatedAt(Instant createdAt){ this.createdAt = createdAt; }
}
