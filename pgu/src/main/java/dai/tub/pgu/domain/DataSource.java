package dai.tub.pgu.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Sprint 0 (F4): fonte de dados externa (R.ID.01-09).
 *
 * <p>Cada componente que envia/recebe dados (simulador, NiFi, Orion, MQTT,
 * GTFS, etc.) e' uma DataSource com estado de saude e contacto do owner.
 *
 * <p>Schema em {@code db/migration/V30__data_source.sql}. O
 * {@link dai.tub.pgu.service.DataSourceHealthService} corre em scheduler
 * periodico para reavaliar {@link #status} com base na idade de {@link #lastSync}.
 */
@Entity
@Table(name = "data_source")
@Getter
@Setter
@NoArgsConstructor
public class DataSource {

    public enum Status {
        HEALTHY,
        DEGRADED,
        DOWN,
        UNKNOWN,
        DISABLED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String nome;

    @Column(nullable = false, length = 32)
    private String tipo;

    @Column(length = 512)
    private String descricao;

    @Column(length = 64)
    private String owner;

    @Column(name = "contacto_email", length = 128)
    private String contactoEmail;

    @Column(name = "contacto_telefone", length = 32)
    private String contactoTelefone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.UNKNOWN;

    @Column(name = "last_sync")
    private OffsetDateTime lastSync;

    @Column(name = "uptime_pct_24h", precision = 5, scale = 2)
    private BigDecimal uptimePct24h;

    @Column(name = "uptime_pct_7d", precision = 5, scale = 2)
    private BigDecimal uptimePct7d;

    // NOTA: a coluna data_source.config_json existe na DB (V30) como JSONB
    // mas o Hibernate nao tem field para ela aqui. Mapeamento direto String <-> JSONB
    // requer @JdbcTypeCode(SqlTypes.JSON) ou type custom; nao e' usado por agora.
    // Para usar no futuro, adicionar o field com o type adequado.

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "pulse_interval_seconds", nullable = false)
    private int pulseIntervalSeconds = 60;

    @Column(name = "degraded_threshold_seconds", nullable = false)
    private int degradedThresholdSeconds = 180;

    @Column(name = "down_threshold_seconds", nullable = false)
    private int downThresholdSeconds = 300;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
