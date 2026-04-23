package dai.tub.pgu.service;

import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.repository.TelemetryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TelemetryServiceTests {
    
    @InjectMocks
    private TelemetryService telemetryService;

    @Mock
    private TelemetryRepository telemetryRepository;

    private TelemetryDTO telemetryDTO;

    @BeforeEach
    void setUp() {
        telemetryDTO = new TelemetryDTO();
        telemetryDTO.setBusId("Autocarro teste");
        telemetryDTO.setTimestamp(Instant.now());
        telemetryDTO.setLatitude(41.545448);
        telemetryDTO.setLongitude(-8.426507);
        telemetryDTO.setSpeed(60.0);
        telemetryDTO.setStatus("Em movimento");
        telemetryDTO.setPassengers(30);
        telemetryDTO.setNextStop("Paragem teste");
        telemetryDTO.setStopsRemaining(5);
    }

    @Test
    @DisplayName("Deve guardar e procesar os dados de telemetria corretamente")
    void testProcessAndSaveTelemetry() {
        telemetryService.processAndSaveTelemetry(telemetryDTO);

        ArgumentCaptor<VehicleTelemetry> captor = ArgumentCaptor.forClass(VehicleTelemetry.class);
        verify(telemetryRepository, times(1)).save(captor.capture());

        VehicleTelemetry savedEntity = captor.getValue();
        assertEquals(telemetryDTO.getBusId(), savedEntity.getBusId());
        assertEquals(telemetryDTO.getPassengers(), savedEntity.getPassengers());
        assertEquals(telemetryDTO.getSpeed(), savedEntity.getSpeedKmh());
        assertEquals(telemetryDTO.getStatus(), savedEntity.getStatus());
        assertEquals(telemetryDTO.getNextStop(), savedEntity.getNextStop());
        // Verificar a localização (latitude e longitude)
        assertNotNull(savedEntity.getLocation());
        assertEquals(telemetryDTO.getLatitude(), savedEntity.getLocation().getY());
        assertEquals(telemetryDTO.getLongitude(), savedEntity.getLocation().getX());
    }

    @Test
    @DisplayName("Deve usar timestamp atual se timestamp for nulo")
    void testProcessAndSaveTelemetryWithNullTimestamp() {
        telemetryDTO.setTimestamp(null);
        telemetryService.processAndSaveTelemetry(telemetryDTO);

        ArgumentCaptor<VehicleTelemetry> captor = ArgumentCaptor.forClass(VehicleTelemetry.class);
        verify(telemetryRepository, times(1)).save(captor.capture());

        VehicleTelemetry savedEntity = captor.getValue();
        assertNotNull(savedEntity.getRecordedAt());
        // Verificar se o timestamp é próximo do tempo atual (dentro de um intervalo de 5 segundos)
        assertTrue(Instant.now().minusSeconds(5).isBefore(savedEntity.getRecordedAt()));
    }
}
