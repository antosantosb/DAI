package dai.tub.pgu.dto;

import dai.tub.pgu.domain.DataSource;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Sprint 0 (F4): DTO publico para o backoffice e clientes REST.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DataSourceDTO {

    private Long id;
    private String nome;
    private String tipo;
    private String descricao;
    private String owner;
    private String contactoEmail;
    private String contactoTelefone;
    private DataSource.Status status;
    private OffsetDateTime lastSync;
    private BigDecimal uptimePct24h;
    private BigDecimal uptimePct7d;
    private boolean enabled;
    private int pulseIntervalSeconds;
    private int degradedThresholdSeconds;
    private int downThresholdSeconds;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    /** Segundos desde o ultimo pulse (null se nunca houve). Util para o frontend. */
    private Long secondsSinceLastSync;

    public static DataSourceDTO from(DataSource d) {
        Long sinceSeconds = null;
        if (d.getLastSync() != null) {
            sinceSeconds = java.time.Duration.between(d.getLastSync(), OffsetDateTime.now()).getSeconds();
        }
        return DataSourceDTO.builder()
                .id(d.getId())
                .nome(d.getNome())
                .tipo(d.getTipo())
                .descricao(d.getDescricao())
                .owner(d.getOwner())
                .contactoEmail(d.getContactoEmail())
                .contactoTelefone(d.getContactoTelefone())
                .status(d.getStatus())
                .lastSync(d.getLastSync())
                .uptimePct24h(d.getUptimePct24h())
                .uptimePct7d(d.getUptimePct7d())
                .enabled(d.isEnabled())
                .pulseIntervalSeconds(d.getPulseIntervalSeconds())
                .degradedThresholdSeconds(d.getDegradedThresholdSeconds())
                .downThresholdSeconds(d.getDownThresholdSeconds())
                .createdAt(d.getCreatedAt())
                .updatedAt(d.getUpdatedAt())
                .secondsSinceLastSync(sinceSeconds)
                .build();
    }
}
