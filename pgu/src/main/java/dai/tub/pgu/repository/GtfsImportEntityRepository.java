package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.GtfsImportEntity;

@Repository
public interface GtfsImportEntityRepository extends JpaRepository<GtfsImportEntity, Long>
{
    List<GtfsImportEntity> findByGtfsImportId(Long importId);

    @Query("SELECT e.entityId FROM GtfsImportEntity e WHERE e.gtfsImport.id = :importId AND e.entityType = :type")
    List<Long> findEntityIdsByImportIdAndType(Long importId, String type);

    @Modifying
    @Query("DELETE FROM GtfsImportEntity e WHERE e.gtfsImport.id = :importId")
    void deleteByImportId(Long importId);
}
