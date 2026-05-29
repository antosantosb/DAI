package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.BlockTrip;

@Repository
public interface BlockTripRepository extends JpaRepository<BlockTrip, Long>
{
    List<BlockTrip> findByBlockIdOrderByTripOrder(Long blockId);
}
