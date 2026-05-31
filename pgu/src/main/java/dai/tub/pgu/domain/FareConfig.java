package dai.tub.pgu.domain;

import java.time.LocalDate;

import jakarta.persistence.*;

/**
 * Sprint 2 (fundacao de bilhetica): tarifario configuravel (sem precos
 * hardcoded; a TUB ajusta sem alterar codigo). {@code validFrom} versiona o
 * tarifario. Precos em centimos ({@code priceCents}).
 *
 * <p>Schema e seed (tarifario TUB 2024) em
 * {@code db/migration/V49__ticketing_foundation.sql}.
 */
@Entity
@Table(name = "fare_config")
public class FareConfig
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // CARTAO, BORDO, PASSE, APP.
    @Column(name = "ticket_type", nullable = false, length = 16)
    private String ticketType;

    // Numero de coroas do ambito: 1 ou 2.
    @Column(nullable = false)
    private Short coroas;

    @Column(name = "price_cents", nullable = false)
    private Integer priceCents;

    @Column(name = "valid_from", nullable = false)
    private LocalDate validFrom;

    // Sprint 5: categoria social (NORMAL, SUB23, REFORMADO, SOCIAL).
    @Column(name = "fare_category", length = 16)
    private String fareCategory = "NORMAL";

    public FareConfig() {}

    // GET
    public Long      getId()         { return this.id; }
    public String    getTicketType() { return this.ticketType; }
    public Short     getCoroas()     { return this.coroas; }
    public Integer   getPriceCents() { return this.priceCents; }
    public LocalDate getValidFrom()  { return this.validFrom; }
    public String    getFareCategory() { return this.fareCategory; }

    // SET
    public void setId(Long id)                  { this.id = id; }
    public void setTicketType(String ticketType){ this.ticketType = ticketType; }
    public void setCoroas(Short coroas)         { this.coroas = coroas; }
    public void setPriceCents(Integer priceCents) { this.priceCents = priceCents; }
    public void setValidFrom(LocalDate validFrom) { this.validFrom = validFrom; }
    public void setFareCategory(String fareCategory) { this.fareCategory = fareCategory; }
}
