package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * Sprint 1 (Fase 1): Block (vehicle block / GTFS block_id) — a cadeia de trips
 * que um autocarro executa num dia de servico. Estrutura criada agora;
 * populada na Fase 4 (o feed TUB nao tem block_id, por isso constroi-se).
 */
@Entity
@Table(name = "block")
public class Block
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(length = 100)
    private String code;

    @Column(name = "service_id", length = 100)
    private String serviceId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "operator_id")
    private Operator operator;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    public Block() {}

    // GET
    public Long     getId()        { return this.id; }
    public String   getCode()      { return this.code; }
    public String   getServiceId() { return this.serviceId; }
    public Operator getOperator()  { return this.operator; }
    public Instant  getCreatedAt() { return this.createdAt; }

    // SET
    public void setId(Long id)                  { this.id = id; }
    public void setCode(String code)            { this.code = code; }
    public void setServiceId(String serviceId)  { this.serviceId = serviceId; }
    public void setOperator(Operator operator)  { this.operator = operator; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
