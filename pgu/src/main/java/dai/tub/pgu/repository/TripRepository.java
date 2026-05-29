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

    long countByRouteId(Long routeId);

    long countByPatternId(Long patternId);

    /** Apagar todas as trips de uma importacao GTFS (cascade DB apaga trip_stop_time). */
    @Modifying
    @Query("DELETE FROM Trip t WHERE t.gtfsImport.id = :importId")
    void deleteByImportId(@Param("importId") Long importId);
}
