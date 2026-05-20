package dai.tub.pgu.repository;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import dai.tub.pgu.domain.DriverBusAssignment;

public interface DriverBusAssignmentRepository extends JpaRepository<DriverBusAssignment, Long> {
    Optional<DriverBusAssignment> findByBusIdAndActiveTrue(String busId);
    Optional<DriverBusAssignment> findByDriverIdAndActiveTrue(Long driverId);
    List<DriverBusAssignment> findByDriverIdOrderByAssignedAtDesc(Long driverId);
}