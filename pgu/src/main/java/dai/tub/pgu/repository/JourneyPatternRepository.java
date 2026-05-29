package dai.tub.pgu.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.JourneyPattern;

@Repository
public interface JourneyPatternRepository extends JpaRepository<JourneyPattern, Long>
{
    List<JourneyPattern> findByRouteIdOrderByDirectionIdAscIdAsc(Long routeId);

    Optional<JourneyPattern> findByRouteIdAndSignature(Long routeId, String signature);

    long countByRouteId(Long routeId);

    /** Apagar todos os padroes de uma importacao GTFS (cascade DB apaga stops/segments/trips). */
    @Modifying
    @Query("DELETE FROM JourneyPattern p WHERE p.gtfsImport.id = :importId")
    void deleteByImportId(@Param("importId") Long importId);

    /** Apagar os padroes de uma rota (re-import: limpa antes de repopular). Cascade DB trata dos filhos. */
    @Modifying
    @Query("DELETE FROM JourneyPattern p WHERE p.route.id = :routeId")
    void deleteByRouteId(@Param("routeId") Long routeId);
}
