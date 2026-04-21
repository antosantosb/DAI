package dai.tub.pgu.repository;

import dai.tub.pgu.domain.ExportJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ExportJobRepository extends JpaRepository<ExportJob, Long>
{
    Optional<ExportJob> findByJobUuid(UUID jobUuid);

    /** Usado pela purga automática: jobs concluídos/falhados há mais de X. */
    List<ExportJob> findByCompletedAtBefore(Instant cutoff);
}
