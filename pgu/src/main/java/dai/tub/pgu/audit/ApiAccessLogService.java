package dai.tub.pgu.audit;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sprint 0 (F2): persiste entries de audit em pool dedicado.
 *
 * <p>Chamado pelo {@link ApiAccessLogFilter} via {@link #logAsync(ApiAccessLog)}.
 * O {@code @Async("auditExecutor")} garante que o insert nao bloqueia o
 * thread do request HTTP.
 *
 * <p>{@code @Transactional(REQUIRES_NEW)} para isolar do request original:
 * uma falha aqui nao deve propagar para o user.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ApiAccessLogService {

    private final ApiAccessLogRepository repo;

    @Async("auditExecutor")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logAsync(ApiAccessLog entry) {
        try {
            repo.save(entry);
        } catch (Exception e) {
            // Audit log nunca pode partir o sistema. Loga e segue.
            log.warn("Falha a inserir api_access_log: {}", e.getMessage());
        }
    }
}
