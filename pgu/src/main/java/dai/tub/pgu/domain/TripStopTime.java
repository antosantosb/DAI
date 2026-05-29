package dai.tub.pgu.domain;

import jakarta.persistence.*;

/**
 * Sprint 1 (Fase 1): TripStopTime (Transmodel TimetabledPassingTime) — a hora
 * de uma trip em cada paragem. Substitui o antigo stop_schedule.
 */
@Entity
@Table(name = "trip_stop_time", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"trip_id", "stop_sequence"})
})
public class TripStopTime
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trip_id", nullable = false)
    private Trip trip;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "stop_id", nullable = false)
    private BusStop stop;

    @Column(name = "stop_sequence", nullable = false)
    private Integer stopSequence;

    @Column(name = "arrival_time", nullable = false, length = 10)
    private String arrivalTime;

    @Column(name = "departure_time", nullable = false, length = 10)
    private String departureTime;

    public TripStopTime() {}

    // GET
    public Long    getId()            { return this.id; }
    public Trip    getTrip()          { return this.trip; }
    public BusStop getStop()          { return this.stop; }
    public Integer getStopSequence()  { return this.stopSequence; }
    public String  getArrivalTime()   { return this.arrivalTime; }
    public String  getDepartureTime() { return this.departureTime; }

    // SET
    public void setId(Long id)                { this.id = id; }
    public void setTrip(Trip trip)            { this.trip = trip; }
    public void setStop(BusStop stop)         { this.stop = stop; }
    public void setStopSequence(Integer seq)  { this.stopSequence = seq; }
    public void setArrivalTime(String time)   { this.arrivalTime = time; }
    public void setDepartureTime(String time) { this.departureTime = time; }
}
