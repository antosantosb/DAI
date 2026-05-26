package dai.tub.pgu.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * Sprint 0 (F2): entry de audit log para uma chamada HTTP.
 *
 * <p>Inserida pelo {@link ApiAccessLogFilter} apos o request ser processado.
 * Schema em {@code db/migration/V29__api_access_log.sql}.
 */
@Entity
@Table(name = "api_access_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApiAccessLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ts", nullable = false)
    private OffsetDateTime ts;

    @Column(name = "ip", length = 45)
    private String ip;

    @Column(name = "username", length = 64)
    private String username;

    @Column(name = "method", length = 8, nullable = false)
    private String method;

    @Column(name = "path", length = 512, nullable = false)
    private String path;

    @Column(name = "query", length = 2048)
    private String query;

    @Column(name = "status", nullable = false)
    private int status;

    @Column(name = "latency_ms", nullable = false)
    private int latencyMs;

    @Column(name = "user_agent", length = 255)
    private String userAgent;
}
