package dai.tub.pgu.domain;

import jakarta.persistence.*;

/**
 * Sprint 1 (Fase 1): paragem ordenada de um JourneyPattern (sem horas).
 * As horas por trip vivem em TripStopTime.
 */
@Entity
@Table(name = "pattern_stop", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"pattern_id", "stop_sequence"})
})
public class PatternStop
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pattern_id", nullable = false)
    private JourneyPattern pattern;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "stop_id", nullable = false)
    private BusStop stop;

    @Column(name = "stop_sequence", nullable = false)
    private Integer stopSequence;

    public PatternStop() {}

    // GET
    public Long           getId()           { return this.id; }
    public JourneyPattern getPattern()      { return this.pattern; }
    public BusStop        getStop()         { return this.stop; }
    public Integer        getStopSequence() { return this.stopSequence; }

    // SET
    public void setId(Long id)                       { this.id = id; }
    public void setPattern(JourneyPattern pattern)   { this.pattern = pattern; }
    public void setStop(BusStop stop)                { this.stop = stop; }
    public void setStopSequence(Integer seq)         { this.stopSequence = seq; }
}
