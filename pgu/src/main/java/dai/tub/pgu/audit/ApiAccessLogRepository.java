package dai.tub.pgu.audit;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Sprint 0 (F2): repositorio para audit log de chamadas HTTP.
 *
 * <p>Inserts feitos pelo {@link ApiAccessLogService} (em pool async).
 * Consultas (filtros, paginacao) serao adicionadas em sprints futuros.
 */
public interface ApiAccessLogRepository extends JpaRepository<ApiAccessLog, Long> {
}
