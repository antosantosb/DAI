package dai.tub.pgu.controller;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.domain.PassengerSensor;
import dai.tub.pgu.dto.PassengerSensorDTO;
import dai.tub.pgu.repository.PassengerSensorRepository;

import jakarta.persistence.EntityNotFoundException;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Sprint 2 (Vertical 3.4, R.ICP.07): CRUD do inventario de sensores APC.
 *
 * <p>Exposto em {@code /api/v1/sensors}. Acesso restrito a admin/funcionario
 * (matchers em {@link dai.tub.pgu.config.SecurityConfig}).
 * <ul>
 *   <li>{@code GET    /api/v1/sensors}      : lista todos.</li>
 *   <li>{@code GET    /api/v1/sensors/{id}} : detalhe.</li>
 *   <li>{@code POST   /api/v1/sensors}      : criar.</li>
 *   <li>{@code DELETE /api/v1/sensors/{id}} : remover.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/sensors")
public class SensorController {

    private final PassengerSensorRepository repo;
    // SRID 4326 (WGS84), coerente com bus_stops/vehicle_telemetry.
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

    public SensorController(PassengerSensorRepository repo) {
        this.repo = repo;
    }

    @GetMapping
    public ResponseEntity<List<PassengerSensorDTO>> list() {
        List<PassengerSensorDTO> data = repo.findAll().stream()
                .map(PassengerSensorDTO::from)
                .toList();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/{id}")
    public ResponseEntity<PassengerSensorDTO> get(@PathVariable Long id) {
        PassengerSensor s = repo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Sensor " + id + " nao encontrado"));
        return ResponseEntity.ok(PassengerSensorDTO.from(s));
    }

    @PostMapping
    @LogActivity(action = "Criar sensor de contagem")
    public ResponseEntity<PassengerSensorDTO> create(@RequestBody PassengerSensorDTO dto) {
        PassengerSensor s = new PassengerSensor();
        s.setGateway(dto.getGateway());
        s.setBusId(dto.getBusId());
        if (dto.getDoorPosition() != null) s.setDoorPosition(dto.getDoorPosition());
        if (dto.getStatus() != null)       s.setStatus(dto.getStatus());
        s.setLastReading(dto.getLastReading());
        if (dto.getLatitude() != null && dto.getLongitude() != null) {
            s.setLocation(geometryFactory.createPoint(
                    new Coordinate(dto.getLongitude(), dto.getLatitude())));
        }
        PassengerSensor saved = repo.save(s);
        return ResponseEntity.status(HttpStatus.CREATED).body(PassengerSensorDTO.from(saved));
    }

    @DeleteMapping("/{id}")
    @LogActivity(action = "Remover sensor de contagem")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!repo.existsById(id)) {
            throw new EntityNotFoundException("Sensor " + id + " nao encontrado");
        }
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
