package dai.tub.pgu.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import dai.tub.pgu.domain.RouteSegment;

public interface RouteSegmentRepository extends JpaRepository<RouteSegment, Long>
{
    List<RouteSegment> findByRouteIdOrderByFromStopOrder(Long routeId);

    Optional<RouteSegment> findByRouteIdAndFromStopOrderAndToStopOrder(
        Long routeId, Integer fromStopOrder, Integer toStopOrder
    );

    @Modifying
    @Query("DELETE FROM RouteSegment rs WHERE rs.route.id = :routeId")
    void deleteByRouteId(Long routeId);
}
