package dai.tub.pgu.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.Bus;

@Repository
public interface BusRepository extends JpaRepository<Bus, Long>
{
    List<Bus> findByRouteIdAndStatus(Long routeId, String status);
    Optional<Bus> findByBusCode(String busCode);
}
