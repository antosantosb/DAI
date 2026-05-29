package dai.tub.pgu.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.Block;

@Repository
public interface BlockRepository extends JpaRepository<Block, Long>
{
}
