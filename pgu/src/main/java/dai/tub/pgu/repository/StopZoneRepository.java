package dai.tub.pgu.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.StopZone;

/**
 * Sprint 2 (fundacao de bilhetica): repositorio da coroa de cada paragem.
 */
@Repository
public interface StopZoneRepository extends JpaRepository<StopZone, Long>
{
    Optional<StopZone> findByStopId(Long stopId);
}
