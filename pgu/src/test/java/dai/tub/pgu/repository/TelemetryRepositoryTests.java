package dai.tub.pgu.repository;
import dai.tub.pgu.domain.VehicleTelemetry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class TelemetryRepositoryTests {
    
    @Autowired
    private TelemetryRepository telemetryRepository;

    @Test
    @DisplayName("Deve garantir a persistência e recuperar dados de telemetria corretamente")
    void testSaveAndRetrieveTelemetry() {
        // Criar uma entidade de telemetria
        GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
        Point location = geometryFactory.createPoint(new Coordinate(-8.426507, 41.545448));
        
        VehicleTelemetry telemetry = new VehicleTelemetry();
        telemetry.setBusId("Autocarro teste");
        telemetry.setRecordedAt(Instant.now());
        telemetry.setLocation(location);
        telemetry.setSpeedKmh(60.0);
        telemetry.setStatus("Em movimento");
        telemetry.setPassengers(30);
        telemetry.setNextStop("Paragem teste");
        telemetry.setStopsRemaining(5);

        // Guardar a entidade
        VehicleTelemetry savedTelemetry = telemetryRepository.save(telemetry);

        // Verificar que a entidade foi guardada corretamente
        assertThat(savedTelemetry.getId()).isNotNull();
        assertThat(savedTelemetry.getBusId()).isEqualTo("Autocarro teste");
        assertThat(savedTelemetry.getPassengers()).isEqualTo(30);
        assertThat(savedTelemetry.getSpeedKmh()).isEqualTo(60.0);
        assertThat(savedTelemetry.getStatus()).isEqualTo("Em movimento");
        assertThat(savedTelemetry.getNextStop()).isEqualTo("Paragem teste");
        assertThat(savedTelemetry.getLocation().getX()).isEqualTo(-8.426507);
        assertThat(savedTelemetry.getLocation().getY()).isEqualTo(41.545448);

        // Recuperar a entidade 
        List<VehicleTelemetry> nearbyBuses = telemetryRepository.findBusesWithinRadius(-8.426507, 41.545448, 1000);
        
        // Verificar que o autocarro recuperado é o mesmo que foi salvo
        assertThat(nearbyBuses).hasSize(1);
        VehicleTelemetry retrievedTelemetry = nearbyBuses.get(0);
        assertThat(retrievedTelemetry.getBusId()).isEqualTo("Autocarro teste");
    }
}
