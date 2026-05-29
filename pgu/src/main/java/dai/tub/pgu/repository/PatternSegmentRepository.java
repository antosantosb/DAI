package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.PatternSegment;

@Repository
public interface PatternSegmentRepository extends JpaRepository<PatternSegment, Long>
{
    List<PatternSegment> findByPatternIdOrderByFromSequence(Long patternId);
}
