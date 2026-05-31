package dai.tub.pgu.repository;

import java.time.OffsetDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.Ticket;

/**
 * Sprint 5 (3.3): repositorio de titulos. Inclui lookup do ticket activo
 * por pseudonimo (deteccao de transbordo).
 */
@Repository
public interface TicketRepository extends JpaRepository<Ticket, Long>
{
    /**
     * Devolve o ticket activo de um cartao no instante `now`.
     * "Activo" = status ACTIVE E validity_end > now.
     */
    @Query(value =
        "SELECT * FROM ticket " +
        "WHERE card_pseudo_id = ?1 " +
        "  AND status = 'ACTIVE' " +
        "  AND validity_end IS NOT NULL " +
        "  AND validity_end > ?2 " +
        "ORDER BY validity_start DESC LIMIT 1", nativeQuery = true)
    Optional<Ticket> findActiveByPseudo(String cardPseudoId, OffsetDateTime now);
}
