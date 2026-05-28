package dai.tub.pgu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.repository.DataSourceRepository;
import dai.tub.pgu.repository.ExportJobRepository;

/**
 * Sprint 1 follow-up: orquestra a propagacao do rename de username em
 * todas as tabelas onde guardamos username como string (sem FK SQL).
 *
 * <p>Inclui apenas as tabelas com **estado activo** ligado ao user. Tabelas
 * de histórico/audit ({@code audit_log}, {@code api_access_log},
 * {@code ai_interaction_log}, {@code gtfs_import.created_by}) ficam
 * intencionalmente com o username antigo — registos históricos devem
 * preservar quem fez a acção no momento em que ela aconteceu.
 *
 * <p>{@code drivers.keycloak_user_id} continua a ser tratado em
 * {@link DriverService#renameKeycloakUserId(String, String)}, que é
 * invocado a seguir pelo controller — separados porque o link a {@code drivers}
 * exige passar pelo entity para manter consistência com restantes operações.
 */
@Service
public class UserReferenceSyncService {

    private static final Logger log = LoggerFactory.getLogger(UserReferenceSyncService.class);

    private final ExportJobRepository exportJobRepository;
    private final DataSourceRepository dataSourceRepository;

    public UserReferenceSyncService(ExportJobRepository exportJobRepository,
                                    DataSourceRepository dataSourceRepository) {
        this.exportJobRepository = exportJobRepository;
        this.dataSourceRepository = dataSourceRepository;
    }

    @Transactional
    public void renameUsernameReferences(String oldUsername, String newUsername) {
        if (oldUsername == null || newUsername == null) return;
        if (oldUsername.equals(newUsername)) return;

        int exports = exportJobRepository.renameRequester(oldUsername, newUsername);
        int sources = dataSourceRepository.renameOwner(oldUsername, newUsername);

        if (exports > 0 || sources > 0) {
            log.info("[USERNAME-RENAME] {} -> {}: {} exports, {} data sources actualizados",
                    oldUsername, newUsername, exports, sources);
        }
    }
}
