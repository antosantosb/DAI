package dai.tub.pgu.repository;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.Ocorrencia;
import dai.tub.pgu.domain.EstadoOcorrencia;
import dai.tub.pgu.domain.PrioridadeOcorrencia;

@Repository
public interface OcorrenciaRepository extends JpaRepository<Ocorrencia, Long> {

    List<Ocorrencia> findByEstadoOrderByTimestampAberturaDesc(EstadoOcorrencia estado);

    List<Ocorrencia> findByAtivoIdAndEstadoNot(String ativoId, EstadoOcorrencia estado);

    List<Ocorrencia> findByAtivoIdAndTipoAnomaliaAndTimestampAberturaAfter(String ativoId, String tipoAnomalia, Instant since);

    List<Ocorrencia> findByPrioridadeAndEstadoAndTimestampAberturaBefore(PrioridadeOcorrencia prioridade, EstadoOcorrencia estado, Instant threshold);
}
