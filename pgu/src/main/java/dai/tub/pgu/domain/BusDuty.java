package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Fase E (E-back-1): BusDuty representa UMA trip planeada para um autocarro
 * num determinado dia. Varias linhas (com sequence crescente) formam a
 * escala completa do bus para esse service_date.
 *
 * Regras (impostas pelo schema + pelo service):
 *   - uq(bus_id, service_date, sequence): a ordem dentro do dia e unica.
 *   - uq(trip_id, service_date): a mesma trip nao pode estar em 2 escalas
 *     no mesmo dia (impede dupla atribuicao).
 *   - planned_start e' denormalizado a partir do primeiro passing-time da
 *     trip (departure_time da primeira paragem) + service_date, para
 *     permitir queries/index sem joins pesados.
 *   - status do duty: PLANNED | RUNNING | DONE | CANCELLED | INTERRUPTED.
 *     O proximo passo (E-back-2) faz transitar PLANNED -> RUNNING -> DONE
 *     quando o motorista iniciar/terminar o servico.
 */
@Entity
@Table(name = "bus_duty", uniqueConstraints = {
    @UniqueConstraint(name = "uq_bus_duty_bus_date_seq", columnNames = {"bus_id", "service_date", "sequence"}),
    @UniqueConstraint(name = "uq_bus_duty_trip_date",    columnNames = {"trip_id", "service_date"})
})
public class BusDuty
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bus_id", nullable = false)
    private Bus bus;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trip_id", nullable = false)
    private Trip trip;

    @Column(name = "service_date", nullable = false)
    private LocalDate serviceDate;

    @Column(nullable = false)
    private Integer sequence;

    @Column(name = "planned_start", nullable = false)
    private Instant plannedStart;

    // Hora de chegada planeada (ultima paragem da trip + service_date).
    // Nullable porque duties legados antes da V57 nao tem este valor.
    @Column(name = "planned_end")
    private Instant plannedEnd;

    @Column(nullable = false, length = 32)
    private String status = "PLANNED";

    // Hora X (#painel de bordo): instante em que o motorista clicou Iniciar
    // e o tipo de partida (EARLY / ON_TIME / LATE). So a PRIMEIRA duty da
    // escala do dia recebe estes valores.
    @Column(name = "actual_start_at")
    private Instant actualStartAt;

    @Column(name = "departure_type", length = 16)
    private String departureType;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public BusDuty() {}

    // GET
    public Long      getId()           { return this.id; }
    public Bus       getBus()          { return this.bus; }
    public Trip      getTrip()         { return this.trip; }
    public LocalDate getServiceDate()  { return this.serviceDate; }
    public Integer   getSequence()     { return this.sequence; }
    public Instant   getPlannedStart() { return this.plannedStart; }
    public Instant   getPlannedEnd()   { return this.plannedEnd; }
    public String    getStatus()       { return this.status; }
    public Instant   getActualStartAt(){ return this.actualStartAt; }
    public String    getDepartureType(){ return this.departureType; }
    public Instant   getCreatedAt()    { return this.createdAt; }
    public Instant   getUpdatedAt()    { return this.updatedAt; }

    // SET
    public void setId(Long id)                       { this.id = id; }
    public void setBus(Bus bus)                      { this.bus = bus; }
    public void setTrip(Trip trip)                   { this.trip = trip; }
    public void setServiceDate(LocalDate date)       { this.serviceDate = date; }
    public void setSequence(Integer sequence)        { this.sequence = sequence; }
    public void setPlannedStart(Instant plannedStart){ this.plannedStart = plannedStart; }
    public void setPlannedEnd(Instant plannedEnd)    { this.plannedEnd = plannedEnd; }
    public void setStatus(String status)             { this.status = status; }
    public void setActualStartAt(Instant when)       { this.actualStartAt = when; }
    public void setDepartureType(String type)        { this.departureType = type; }
    public void setCreatedAt(Instant createdAt)      { this.createdAt = createdAt; }
    public void setUpdatedAt(Instant updatedAt)      { this.updatedAt = updatedAt; }
}
