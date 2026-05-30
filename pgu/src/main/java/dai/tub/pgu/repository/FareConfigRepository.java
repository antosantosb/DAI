package dai.tub.pgu.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.FareConfig;

/**
 * Sprint 2 (fundacao de bilhetica): repositorio do tarifario configuravel.
 */
@Repository
public interface FareConfigRepository extends JpaRepository<FareConfig, Long>
{
}
