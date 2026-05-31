package dai.tub.pgu.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.FareConfig;

/**
 * Sprint 5 (3.3): queries de tarifario.
 */
@Repository
public interface FareConfigRepository extends JpaRepository<FareConfig, Long>
{
    /** Encontra o preco aplicavel a um tipo+coroas+categoria na data dada. */
    @Query(value =
        "SELECT * FROM fare_config " +
        "WHERE ticket_type = ?1 AND coroas = ?2 AND fare_category = ?3 " +
        "  AND valid_from <= ?4 " +
        "ORDER BY valid_from DESC LIMIT 1", nativeQuery = true)
    Optional<FareConfig> findApplicable(String ticketType, Short coroas,
                                        String fareCategory, LocalDate at);

    /** Tabela completa (para o admin gerir / dashboard). */
    List<FareConfig> findAllByOrderByTicketTypeAscCoroasAscValidFromDesc();
}
