package dai.tub.pgu.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.Ticket;

/**
 * Sprint 2 (fundacao de bilhetica): repositorio de titulos de transporte.
 */
@Repository
public interface TicketRepository extends JpaRepository<Ticket, Long>
{
}
