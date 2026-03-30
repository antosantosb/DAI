package dai.tub.pgu.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import dai.tub.pgu.domain.RouteSegment;

public interface RouteSegmentRepository extends JpaRepository<RouteSegment, Long>
{
    List<RouteSegment> findByRouteIdOrderByFromStopOrder(Long routeId);

    Optional<RouteSegment> findByRouteIdAndFromStopOrderAndToStopOrder(
        Long routeId, Integer fromStopOrder, Integer toStopOrder
    );

    void deleteByRouteId(Long routeId);
}
