package dai.tub.pgu.repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import dai.tub.pgu.domain.VehicleDiagnostic;

@Repository
public interface VehicleDiagnosticRepository
        extends JpaRepository<VehicleDiagnostic, VehicleDiagnostic.Pk>
{
    @Query(value = "SELECT * FROM vehicle_diagnostic WHERE bus_id = ?1 " +
                   "ORDER BY recorded_at DESC LIMIT 1", nativeQuery = true)
    Optional<VehicleDiagnostic> findLatestByBusId(String busId);

    @Query(value = "SELECT DISTINCT ON (bus_id) * FROM vehicle_diagnostic " +
                   "ORDER BY bus_id, recorded_at DESC", nativeQuery = true)
    List<VehicleDiagnostic> findLatestPerBus();

    @Query(value =
        "SELECT powertrain AS powertrain, COUNT(DISTINCT bus_id) AS total " +
        "FROM vehicle_diagnostic " +
        "WHERE recorded_at >= NOW() - INTERVAL '24 hours' " +
        "GROUP BY powertrain", nativeQuery = true)
    List<Map<String, Object>> countActiveByPowertrain24h();

    @Query(value =
        "SELECT AVG(soh_pct) FROM vehicle_diagnostic " +
        "WHERE powertrain = 'ELECTRIC' AND soh_pct IS NOT NULL " +
        "AND recorded_at >= NOW() - INTERVAL '24 hours'", nativeQuery = true)
    Double avgSoh24h();

    @Query(value =
        "SELECT AVG(dpf_soot_pct) FROM vehicle_diagnostic " +
        "WHERE powertrain = 'DIESEL' AND dpf_soot_pct IS NOT NULL " +
        "AND recorded_at >= NOW() - INTERVAL '24 hours'", nativeQuery = true)
    Double avgDpf24h();
}
