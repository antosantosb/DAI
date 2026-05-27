package dai.tub.pgu.repository;

import dai.tub.pgu.domain.DataSource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DataSourceRepository extends JpaRepository<DataSource, Long> {
    Optional<DataSource> findByNome(String nome);
    List<DataSource> findByStatus(DataSource.Status status);
    List<DataSource> findByEnabledTrue();
}
