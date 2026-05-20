package dai.tub.pgu.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.OcorrenciaAnexo;
import java.util.List;

@Repository
public interface OcorrenciaAnexoRepository extends JpaRepository<OcorrenciaAnexo, Long> {
    List<OcorrenciaAnexo> findByOcorrenciaId(Long ocorrenciaId);
}
