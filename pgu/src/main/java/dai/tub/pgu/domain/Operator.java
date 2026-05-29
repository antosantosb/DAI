package dai.tub.pgu.domain;

import java.time.OffsetDateTime;

import jakarta.persistence.*;

/**
 * Sprint 1 (F0): operador de transportes (R.IVT.03).
 *
 * <p>Modelo alinhado com NeTEx Organisation/Operator. Os campos minimos
 * sao {@code code}, {@code name} e {@code country}. {@code taxId} e
 * {@code contactEmail} sao opcionais para suportar casos onde a entidade
 * ainda nao esta totalmente registada no Catalogo Nacional (AMA).
 */
@Entity
@Table(name = "operators")
public class Operator
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 32)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(name = "tax_id", length = 32)
    private String taxId;

    @Column(nullable = false, length = 2)
    private String country = "PT";

    @Column(name = "contact_email")
    private String contactEmail;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    public Operator() {}

    @PreUpdate
    void touch() { this.updatedAt = OffsetDateTime.now(); }

    // GET
    public Long           getId()           { return this.id; }
    public String         getCode()         { return this.code; }
    public String         getName()         { return this.name; }
    public String         getTaxId()        { return this.taxId; }
    public String         getCountry()      { return this.country; }
    public String         getContactEmail() { return this.contactEmail; }
    public OffsetDateTime getCreatedAt()    { return this.createdAt; }
    public OffsetDateTime getUpdatedAt()    { return this.updatedAt; }

    // SET
    public void setId(Long id)                       { this.id = id; }
    public void setCode(String code)                 { this.code = code; }
    public void setName(String name)                 { this.name = name; }
    public void setTaxId(String taxId)               { this.taxId = taxId; }
    public void setCountry(String country)           { this.country = country; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
