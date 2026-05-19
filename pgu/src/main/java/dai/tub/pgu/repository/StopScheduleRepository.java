package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.StopSchedule;

@Repository
public interface StopScheduleRepository extends JpaRepository<StopSchedule, Long>
{
    /** Horarios de uma paragem, ordenados por arrival_time. */
    @Query("SELECT s FROM StopSchedule s WHERE s.stop.id = :stopId ORDER BY s.arrivalTime")
    List<StopSchedule> findByStopId(@Param("stopId") Long stopId);

    /** Horarios de uma paragem numa rota especifica. */
    @Query("SELECT s FROM StopSchedule s WHERE s.stop.id = :stopId AND s.route.id = :routeId ORDER BY s.arrivalTime")
    List<StopSchedule> findByStopIdAndRouteId(@Param("stopId") Long stopId, @Param("routeId") Long routeId);

    /** Horarios por rota (todos os stops), para tabela de horarios completa. */
    @Query("SELECT s FROM StopSchedule s WHERE s.route.id = :routeId ORDER BY s.tripId, s.stopSequence")
    List<StopSchedule> findByRouteId(@Param("routeId") Long routeId);

    /** Apagar todos os horarios de uma importacao GTFS. */
    @Modifying
    @Query("DELETE FROM StopSchedule s WHERE s.gtfsImport.id = :importId")
    void deleteByImportId(@Param("importId") Long importId);

    /** Apagar todos os horarios de uma rota. */
    @Modifying
    @Query("DELETE FROM StopSchedule s WHERE s.route.id = :routeId")
    void deleteByRouteId(@Param("routeId") Long routeId);

    /** Contar horarios por importacao. */
    @Query("SELECT COUNT(s) FROM StopSchedule s WHERE s.gtfsImport.id = :importId")
    long countByImportId(@Param("importId") Long importId);

    /** Distinct trip count por rota (para saber quantas viagens existem). */
    @Query("SELECT COUNT(DISTINCT s.tripId) FROM StopSchedule s WHERE s.route.id = :routeId")
    long countDistinctTripsByRouteId(@Param("routeId") Long routeId);
}
