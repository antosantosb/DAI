package dai.tub.pgu.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import dai.tub.pgu.domain.AiInteractionLog;

public interface AiInteractionLogRepository extends JpaRepository<AiInteractionLog, Long> {

    Page<AiInteractionLog> findByUserIdOrderByCreatedAtDesc(String userId, Pageable pageable);

    Page<AiInteractionLog> findByStatusOrderByCreatedAtDesc(AiInteractionLog.Status status, Pageable pageable);

    @Query("SELECT COUNT(l) FROM AiInteractionLog l WHERE l.userId = :userId AND l.createdAt >= :since")
    long countByUserSince(@Param("userId") String userId, @Param("since") Instant since);

    @Query("SELECT AVG(l.latencyMs) FROM AiInteractionLog l WHERE l.status = 'SUCCESS' AND l.createdAt >= :since")
    Double averageLatencyMsSince(@Param("since") Instant since);

    // ---- Métodos adicionais para monitoring ----
    long countByCreatedAtAfter(Instant since);

    @Query("SELECT AVG(l.latencyMs) FROM AiInteractionLog l WHERE l.createdAt >= :since")
    Double averageLatencySince(@Param("since") Instant since);

    @Query(value = """
        SELECT unnest(tools_called) AS tool, COUNT(*) AS cnt
        FROM ai_interaction_log
        WHERE created_at >= :since
        GROUP BY tool
        ORDER BY cnt DESC
        LIMIT 10
        """, nativeQuery = true)
    List<Object[]> findTopToolsLast24h(@Param("since") Instant since);
}