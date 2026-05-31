package dai.tub.pgu.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.Bus;

@Repository
public interface BusRepository extends JpaRepository<Bus, Long>
{
    List<Bus> findByRouteIdAndStatus(Long routeId, String status);
    Optional<Bus> findByBusCode(String busCode);

    /** Sprint 5 (follow-up): buses de uma rota cujo status esta dentro de um
     *  conjunto (ex.: EM_SERVICO, STARTING, STOPPING para "em operacao"). */
    @Query("SELECT b FROM Bus b WHERE b.route.id = :routeId AND b.status IN :statuses")
    List<Bus> findByRouteIdAndStatusIn(@Param("routeId") Long routeId,
                                        @Param("statuses") Collection<String> statuses);
}
