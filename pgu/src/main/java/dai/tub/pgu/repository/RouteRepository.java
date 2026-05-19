package dai.tub.pgu.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.Route;
import jakarta.persistence.LockModeType;

@Repository
public interface RouteRepository extends JpaRepository<Route, Long>
{
    Optional<Route> findByCode(String code);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM Route r WHERE r.code = :code")
    Optional<Route> findByCodeForUpdate(String code);
}
