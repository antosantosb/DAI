package dai.tub.pgu.repository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.DisplayPanel;

@Repository
public interface DisplayPanelRepository extends JpaRepository<DisplayPanel, Long>
{
    Optional<DisplayPanel> findByCode(String code);

    List<DisplayPanel> findAllByOrderByNameAsc();

    List<DisplayPanel> findByEnabledTrueOrderByNameAsc();

    /** Painéis cujo last_heartbeat ja' passou do limite (offline_threshold). */
    @Query("SELECT p FROM DisplayPanel p WHERE p.enabled = true " +
           "AND (p.lastHeartbeat IS NULL OR p.lastHeartbeat < :cutoff) " +
           "AND p.status NOT IN ('OFFLINE','DISABLED')")
    List<DisplayPanel> findStaleHeartbeat(Instant cutoff);

    @Query(value = "SELECT status AS status, COUNT(*) AS total " +
                   "FROM display_panel WHERE enabled = TRUE " +
                   "GROUP BY status", nativeQuery = true)
    List<Map<String, Object>> countByStatus();

    @Query(value = "SELECT type AS type, COUNT(*) AS total " +
                   "FROM display_panel WHERE enabled = TRUE " +
                   "GROUP BY type", nativeQuery = true)
    List<Map<String, Object>> countByType();
}
