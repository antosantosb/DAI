package dai.tub.pgu.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.Route;

@Repository
public interface RouteRepository extends JpaRepository<Route, Long>
{
}
