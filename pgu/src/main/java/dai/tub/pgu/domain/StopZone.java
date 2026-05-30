package dai.tub.pgu.domain;

import jakarta.persistence.*;

/**
 * Sprint 2 (fundacao de bilhetica): mapeia uma paragem a uma coroa (zona
 * tarifaria da TUB). Apenas 2 coroas: 1 = centro alargado de Braga, 2 =
 * periferia do concelho. Unico por paragem.
 *
 * <p>Schema em {@code db/migration/V49__ticketing_foundation.sql}.
 */
@Entity
@Table(name = "stop_zone")
public class StopZone
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // FK para bus_stops(id). Mapeada como coluna simples (so o id) para manter
    // o modelo leve nesta fase de fundacao.
    @Column(name = "stop_id", nullable = false, unique = true)
    private Long stopId;

    // Coroa da paragem: 1 (centro alargado) ou 2 (periferia).
    @Column(nullable = false)
    private Short coroa;

    public StopZone() {}

    // GET
    public Long  getId()     { return this.id; }
    public Long  getStopId() { return this.stopId; }
    public Short getCoroa()  { return this.coroa; }

    // SET
    public void setId(Long id)         { this.id = id; }
    public void setStopId(Long stopId) { this.stopId = stopId; }
    public void setCoroa(Short coroa)  { this.coroa = coroa; }
}
