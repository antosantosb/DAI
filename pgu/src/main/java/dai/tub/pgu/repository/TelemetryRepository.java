package dai.tub.pgu.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.VehicleTelemetry;

@Repository
public interface TelemetryRepository extends JpaRepository<VehicleTelemetry, Long>
{   
    @Query(value = "SELECT * FROM vehicle_telemetry WHERE ST_DWithin(CAST(location AS geography), CAST(ST_SetSRID(ST_MakePoint(?1, ?2), 4326) AS geography), ?3)", nativeQuery = true)
    List<VehicleTelemetry> findBusesWithinRadius(double longitude, double latitude, double radiusInMeters);

    // Adicionar mais queries futuramente...
}
