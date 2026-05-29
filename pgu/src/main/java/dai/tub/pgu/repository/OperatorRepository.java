package dai.tub.pgu.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import dai.tub.pgu.domain.Operator;

public interface OperatorRepository extends JpaRepository<Operator, Long>
{
    Optional<Operator> findByCode(String code);

    boolean existsByCode(String code);
}
