package dai.tub.pgu.dto;

import dai.tub.pgu.domain.Operator;

/**
 * Sprint 1 (F0): DTO de operador.
 */
public class OperatorDTO
{
    private Long id;
    private String code;
    private String name;
    private String taxId;
    private String country;
    private String contactEmail;
    // Sprint 1 (F0): contagem de rotas associadas (populado pelo service).
    private Long routeCount;

    public OperatorDTO() {}

    public static OperatorDTO fromEntity(Operator op)
    {
        if (op == null) return null;
        OperatorDTO dto = new OperatorDTO();
        dto.id = op.getId();
        dto.code = op.getCode();
        dto.name = op.getName();
        dto.taxId = op.getTaxId();
        dto.country = op.getCountry();
        dto.contactEmail = op.getContactEmail();
        return dto;
    }

    // GET
    public Long   getId()           { return this.id; }
    public String getCode()         { return this.code; }
    public String getName()         { return this.name; }
    public String getTaxId()        { return this.taxId; }
    public String getCountry()      { return this.country; }
    public String getContactEmail() { return this.contactEmail; }
    public Long   getRouteCount()   { return this.routeCount; }

    // SET
    public void setId(Long id)                       { this.id = id; }
    public void setCode(String code)                 { this.code = code; }
    public void setName(String name)                 { this.name = name; }
    public void setTaxId(String taxId)               { this.taxId = taxId; }
    public void setCountry(String country)           { this.country = country; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }
    public void setRouteCount(Long routeCount)       { this.routeCount = routeCount; }
}
