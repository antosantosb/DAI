package dai.tub.pgu.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * Sprint 0 (F4): registo de cada pulse recebido (ou status check feito pelo
 * scheduler). Audit trail completo para investigacao de incidentes e base
 * para o calculo de uptime.
 */
@Entity
@Table(name = "data_source_pulse")
@Getter
@Setter
@NoArgsConstructor
public class DataSourcePulse {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "data_source_id", nullable = false)
    private DataSource dataSource;

    @Column(nullable = false)
    private OffsetDateTime ts = OffsetDateTime.now();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private DataSource.Status status;

    @Column(columnDefinition = "text")
    private String detalhes;
}
