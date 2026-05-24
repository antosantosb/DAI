package dai.tub.pgu.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import dai.tub.pgu.domain.Driver;

public interface DriverRepository extends JpaRepository<Driver, Long> {
    Optional<Driver> findByMechanographicNumber(String mechanographicNumber);
    Optional<Driver> findByKeycloakUserId(String keycloakUserId);
}