package dai.tub.pgu.repository;

import dai.tub.pgu.model.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findTop200ByOrderByCreatedAtDesc();

    List<AuditLog> findByCreatedAtGreaterThanEqualAndCreatedAtLessThanEqualOrderByCreatedAtDesc(
        LocalDateTime from, LocalDateTime to);

    List<AuditLog> findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(LocalDateTime from);

    List<AuditLog> findByCreatedAtLessThanEqualOrderByCreatedAtDesc(LocalDateTime to);

    List<AuditLog> findAllByOrderByCreatedAtDesc();
}
