package dai.tub.pgu.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Sprint 1 (Fase 1): geometria entre duas paragens consecutivas de um padrao.
 * {@code points} guarda a polyline [[lon,lat], ...] (shapes.txt ou OSRM).
 */
@Entity
@Table(name = "pattern_segment", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"pattern_id", "from_sequence", "to_sequence"})
})
public class PatternSegment
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pattern_id", nullable = false)
    private JourneyPattern pattern;

    @Column(name = "from_sequence", nullable = false)
    private Integer fromSequence;

    @Column(name = "to_sequence", nullable = false)
    private Integer toSequence;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private String points;

    public PatternSegment() {}

    // GET
    public Long           getId()           { return this.id; }
    public JourneyPattern getPattern()      { return this.pattern; }
    public Integer        getFromSequence() { return this.fromSequence; }
    public Integer        getToSequence()   { return this.toSequence; }
    public String         getPoints()       { return this.points; }

    // SET
    public void setId(Long id)                     { this.id = id; }
    public void setPattern(JourneyPattern pattern) { this.pattern = pattern; }
    public void setFromSequence(Integer from)      { this.fromSequence = from; }
    public void setToSequence(Integer to)          { this.toSequence = to; }
    public void setPoints(String points)           { this.points = points; }
}
