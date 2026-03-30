package dai.tub.pgu.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.Bus;

@Repository
public interface BusRepository extends JpaRepository<Bus, Long>
{
}
