package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.TripStopTime;

@Repository
public interface TripStopTimeRepository extends JpaRepository<TripStopTime, Long>
{
    List<TripStopTime> findByTripIdOrderByStopSequence(Long tripId);

    /** Horarios de uma paragem (com trip/rota/padrao carregados), ordenados por arrival. */
    @Query("SELECT t FROM TripStopTime t "
         + "JOIN FETCH t.trip tr JOIN FETCH tr.route JOIN FETCH tr.pattern JOIN FETCH t.stop "
         + "WHERE t.stop.id = :stopId ORDER BY t.arrivalTime")
    List<TripStopTime> findByStopIdFull(@Param("stopId") Long stopId);

    /** Horarios de uma paragem numa rota especifica. */
    @Query("SELECT t FROM TripStopTime t "
         + "JOIN FETCH t.trip tr JOIN FETCH tr.route JOIN FETCH tr.pattern JOIN FETCH t.stop "
         + "WHERE t.stop.id = :stopId AND tr.route.id = :routeId ORDER BY t.arrivalTime")
    List<TripStopTime> findByStopIdAndRouteIdFull(@Param("stopId") Long stopId, @Param("routeId") Long routeId);

    /** Todos os horarios de uma rota (para tabela completa). */
    @Query("SELECT t FROM TripStopTime t "
         + "JOIN FETCH t.trip tr JOIN FETCH tr.route JOIN FETCH tr.pattern JOIN FETCH t.stop "
         + "WHERE tr.route.id = :routeId ORDER BY tr.gtfsTripId, t.stopSequence")
    List<TripStopTime> findByRouteIdFull(@Param("routeId") Long routeId);

    /** Contar passing-times de uma importacao GTFS. */
    @Query("SELECT COUNT(t) FROM TripStopTime t WHERE t.trip.gtfsImport.id = :importId")
    long countByImportId(@Param("importId") Long importId);
}
