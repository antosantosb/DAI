package dai.tub.pgu.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.ValidationEvent;

/**
 * Sprint 2 (fundacao de bilhetica): repositorio de eventos de validacao.
 */
@Repository
public interface ValidationEventRepository extends JpaRepository<ValidationEvent, Long>
{
}
