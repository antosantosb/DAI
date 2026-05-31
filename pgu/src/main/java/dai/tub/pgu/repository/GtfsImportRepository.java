package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.GtfsImport;

@Repository
public interface GtfsImportRepository extends JpaRepository<GtfsImport, Long>
{
    List<GtfsImport> findAllByOrderByCreatedAtDesc();

    /** Última importação TUB_SCHEDULED que não falhou (para cálculo de intervalo). */
    @Query("SELECT i FROM GtfsImport i WHERE i.source = 'TUB_SCHEDULED' AND i.status <> 'FAILED' ORDER BY i.createdAt DESC")
    List<GtfsImport> findLastSuccessfulScheduled();

    /** Última importação COMPLETED de qualquer fonte (para skip logic). */
    @Query("SELECT i FROM GtfsImport i WHERE i.status = 'COMPLETED' AND i.revertedAt IS NULL ORDER BY i.finishedAt DESC")
    List<GtfsImport> findLastCompleted();
}
