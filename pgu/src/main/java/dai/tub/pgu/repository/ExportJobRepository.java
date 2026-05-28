package dai.tub.pgu.repository;

import dai.tub.pgu.domain.ExportJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ExportJobRepository extends JpaRepository<ExportJob, Long>
{
    Optional<ExportJob> findByJobUuid(UUID jobUuid);

    List<ExportJob> findByDataType(ExportJob.DataType dataType);

    /** Usado pela purga automática: jobs concluídos/falhados há mais de X. */
    List<ExportJob> findByCompletedAtBefore(Instant cutoff);

    /**
     * Sprint 1 follow-up: actualiza {@code requested_by} quando o username
     * do user dono é renomeado. Sem isto, o user perdia acesso aos seus
     * exports no filtro "me" (string match no username).
     */
    @Modifying
    @Query("UPDATE ExportJob e SET e.requestedBy = :newUsername WHERE e.requestedBy = :oldUsername")
    int renameRequester(@Param("oldUsername") String oldUsername,
                        @Param("newUsername") String newUsername);
}
