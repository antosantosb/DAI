package dai.tub.pgu.domain;

import jakarta.persistence.*;

/**
 * Sprint 1 (Fase 1): trip de um Block, por ordem de execucao.
 * Populado na Fase 4.
 */
@Entity
@Table(name = "block_trip", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"block_id", "trip_order"})
})
public class BlockTrip
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "block_id", nullable = false)
    private Block block;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trip_id", nullable = false)
    private Trip trip;

    @Column(name = "trip_order", nullable = false)
    private Integer tripOrder;

    public BlockTrip() {}

    // GET
    public Long    getId()        { return this.id; }
    public Block   getBlock()     { return this.block; }
    public Trip    getTrip()      { return this.trip; }
    public Integer getTripOrder() { return this.tripOrder; }

    // SET
    public void setId(Long id)               { this.id = id; }
    public void setBlock(Block block)        { this.block = block; }
    public void setTrip(Trip trip)           { this.trip = trip; }
    public void setTripOrder(Integer order)  { this.tripOrder = order; }
}
