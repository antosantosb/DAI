package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.DisplayPanelEvent;

@Repository
public interface DisplayPanelEventRepository extends JpaRepository<DisplayPanelEvent, Long>
{
    List<DisplayPanelEvent> findTop50ByPanelIdOrderByTsDesc(Long panelId);
}
