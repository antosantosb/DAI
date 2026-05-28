package dai.tub.pgu.repository;

import dai.tub.pgu.domain.DataSource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DataSourceRepository extends JpaRepository<DataSource, Long> {
    Optional<DataSource> findByNome(String nome);
    List<DataSource> findByStatus(DataSource.Status status);
    List<DataSource> findByEnabledTrue();

    /**
     * Sprint 1 follow-up: actualiza {@code owner} quando o username do user
     * dono é renomeado. Sem isto, as data sources mantinham o username
     * antigo e o user perdia o link às suas data sources.
     */
    @Modifying
    @Query("UPDATE DataSource d SET d.owner = :newUsername WHERE d.owner = :oldUsername")
    int renameOwner(@Param("oldUsername") String oldUsername,
                    @Param("newUsername") String newUsername);
}
