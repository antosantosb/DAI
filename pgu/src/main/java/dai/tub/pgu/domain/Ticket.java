package dai.tub.pgu.domain;

import java.time.OffsetDateTime;

import jakarta.persistence.*;

/**
 * Sprint 2 (fundacao de bilhetica): titulo de transporte da TUB.
 *
 * <p>A PGU nao emite titulos; apenas regista/monitoriza os que a TUB emite.
 * O cartao e' sempre pseudonimizado ({@code cardPseudoId}); no bilhete de
 * bordo (numerario) fica NULL. Modelo "coroas + tempo": {@code coroaScope}
 * indica o ambito (1 coroa ou rede geral) e a janela {@code validityStart} ..
 * {@code validityEnd} cobre 1 hora com transbordo livre.
 *
 * <p>Compativel com o Smart Data Model {@code Ticket} da FIWARE.
 *
 * <p>Schema em {@code db/migration/V49__ticketing_foundation.sql}.
 */
@Entity
@Table(name = "ticket")
public class Ticket
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // CARTAO, BORDO, PASSE, APP.
    @Column(nullable = false, length = 16)
    private String tipo;

    // 1 = uma coroa, 2 = rede geral (duas coroas). Pode ser NULL enquanto nao
    // resolvido (ex.: app calcula no check-out).
    @Column(name = "coroa_scope")
    private Short coroaScope;

    @Column(name = "validity_start")
    private OffsetDateTime validityStart;

    @Column(name = "validity_end")
    private OffsetDateTime validityEnd;

    // SHA-256(cardReal + salt); NULL no bordo (sem identificador).
    @Column(name = "card_pseudo_id", length = 64)
    private String cardPseudoId;

    // ACTIVE, EXPIRED, CANCELLED, ...
    @Column(length = 16)
    private String status;

    // Sprint 5: NORMAL, SUB23, REFORMADO, SOCIAL.
    @Column(name = "fare_category", length = 16)
    private String fareCategory = "NORMAL";

    public Ticket() {}

    // GET
    public Long           getId()            { return this.id; }
    public String         getTipo()          { return this.tipo; }
    public Short          getCoroaScope()    { return this.coroaScope; }
    public OffsetDateTime getValidityStart() { return this.validityStart; }
    public OffsetDateTime getValidityEnd()   { return this.validityEnd; }
    public String         getCardPseudoId()  { return this.cardPseudoId; }
    public String         getStatus()        { return this.status; }
    public String         getFareCategory()  { return this.fareCategory; }

    // SET
    public void setId(Long id)                            { this.id = id; }
    public void setTipo(String tipo)                      { this.tipo = tipo; }
    public void setCoroaScope(Short coroaScope)           { this.coroaScope = coroaScope; }
    public void setValidityStart(OffsetDateTime start)    { this.validityStart = start; }
    public void setValidityEnd(OffsetDateTime end)        { this.validityEnd = end; }
    public void setCardPseudoId(String cardPseudoId)      { this.cardPseudoId = cardPseudoId; }
    public void setStatus(String status)                  { this.status = status; }
    public void setFareCategory(String fareCategory)      { this.fareCategory = fareCategory; }
}
