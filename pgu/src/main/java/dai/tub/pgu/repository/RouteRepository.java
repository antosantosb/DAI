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

    // Sprint 1 (F0): contagem de rotas por operador (R.IVT.03).
    // Usado pelo OperatorService para popular OperatorDTO.routeCount.
    long countByOperator_Id(Long operatorId);

    java.util.List<Route> findByOperator_Id(Long operatorId);
}
