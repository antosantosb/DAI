package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.RouteStop;

@Repository
public interface RouteStopRepository extends JpaRepository<RouteStop, Long>
{
    List<RouteStop> findByStopId(Long stopId);

    @Modifying
    @Query("DELETE FROM RouteStop rs WHERE rs.route.id = :routeId")
    void deleteByRouteId(Long routeId);
}
