package dai.tub.pgu.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.BusStop;

@Repository
public interface BusStopRepository extends JpaRepository<BusStop, Long>
{
}
