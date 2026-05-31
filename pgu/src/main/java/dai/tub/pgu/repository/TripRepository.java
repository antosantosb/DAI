package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.Trip;

@Repository
public interface TripRepository extends JpaRepository<Trip, Long>
{
    List<Trip> findByRouteId(Long routeId);

    List<Trip> findByPatternId(Long patternId);

    /** Sprint 5 (follow-up) - dev quick-duty: trip por código de rota +
     *  directionId + headsign (LIKE case-insensitive). Ordenado por id. */
    @Query("SELECT t FROM Trip t WHERE t.route.code = :routeCode "
         + "AND t.pattern.directionId = :directionId "
         + "AND LOWER(t.headsign) LIKE LOWER(CONCAT('%', :headsign, '%')) "
         + "ORDER BY t.id ASC")
    List<Trip> findByRouteCodeDirectionAndHeadsignLike(
        @Param("routeCode") String routeCode,
        @Param("directionId") Integer directionId,
        @Param("headsign") String headsign);

    /** Sprint 5 (follow-up) - fallback: trips de uma rota por código (id ASC). */
    @Query("SELECT t FROM Trip t WHERE t.route.code = :routeCode ORDER BY t.id ASC")
    List<Trip> findByRouteCode(@Param("routeCode") String routeCode);

    long countByRouteId(Long routeId);

    long countByPatternId(Long patternId);

    /** Apagar todas as trips de uma importacao GTFS (cascade DB apaga trip_stop_time). */
    @Modifying
    @Query("DELETE FROM Trip t WHERE t.gtfsImport.id = :importId")
    void deleteByImportId(@Param("importId") Long importId);

    /**
     * Apagar todas as trips de um padrao (ao apagar o JourneyPattern). Os
     * trip_stop_time devem ser apagados ANTES (ver TripStopTimeRepository), senao
     * a FK trip_id impede a remocao das trips.
     */
    @Modifying
    @Query("DELETE FROM Trip t WHERE t.pattern.id = :patternId")
    void deleteByPatternId(@Param("patternId") Long patternId);
}
