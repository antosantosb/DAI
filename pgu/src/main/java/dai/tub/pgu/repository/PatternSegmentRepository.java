package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.PatternSegment;

@Repository
public interface PatternSegmentRepository extends JpaRepository<PatternSegment, Long>
{
    List<PatternSegment> findByPatternIdOrderByFromSequence(Long patternId);

    /** Apagar a geometria de um padrao (edicao: limpa antes de repopular). */
    @Modifying
    @Query("DELETE FROM PatternSegment seg WHERE seg.pattern.id = :patternId")
    void deleteByPatternId(@Param("patternId") Long patternId);
}
