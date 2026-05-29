package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.PatternStop;

@Repository
public interface PatternStopRepository extends JpaRepository<PatternStop, Long>
{
    List<PatternStop> findByPatternIdOrderByStopSequence(Long patternId);

    long countByPatternId(Long patternId);

    /** Paragens-em-padrao que referenciam esta paragem (com padrao + rota carregados). */
    @Query("SELECT ps FROM PatternStop ps JOIN FETCH ps.pattern p JOIN FETCH p.route WHERE ps.stop.id = :stopId")
    List<PatternStop> findByStopIdFull(@Param("stopId") Long stopId);
}
