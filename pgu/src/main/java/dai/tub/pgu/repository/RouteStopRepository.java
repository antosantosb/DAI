package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.RouteStop;

@Repository
public interface RouteStopRepository extends JpaRepository<RouteStop, Long>
{
    List<RouteStop> findByStopId(Long stopId);
}
