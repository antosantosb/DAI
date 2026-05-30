package dai.tub.pgu.repository;

import dai.tub.pgu.domain.PassengerSensor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Sprint 2 (Vertical 3.4, R.ICP.07): repositorio do inventario de sensores APC.
 */
@Repository
public interface PassengerSensorRepository extends JpaRepository<PassengerSensor, Long> {
    List<PassengerSensor> findByBusId(Long busId);
    List<PassengerSensor> findByStatus(String status);
}
