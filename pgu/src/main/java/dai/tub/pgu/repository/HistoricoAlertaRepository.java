package dai.tub.pgu.repository;
import dai.tub.pgu.model.HistoricoAlerta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HistoricoAlertaRepository extends JpaRepository<HistoricoAlerta, Long> {
}
