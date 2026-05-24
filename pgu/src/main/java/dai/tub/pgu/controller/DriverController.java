package dai.tub.pgu.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.domain.Driver;
import dai.tub.pgu.domain.DriverBusAssignment;
import dai.tub.pgu.dto.DriverAssignmentDTO;
import dai.tub.pgu.dto.DriverDetailDTO;
import dai.tub.pgu.dto.UnassignRequestDTO;
import dai.tub.pgu.service.DriverService;

@RestController
@RequestMapping("/api/v1/drivers")
public class DriverController {

    private final DriverService driverService;

    public DriverController(DriverService driverService) {
        this.driverService = driverService;
    }

    /**
     * Endpoint do painel de bordo: devolve o busCode do autocarro atribuído ao motorista autenticado.
     */
    @GetMapping("/me/bus")
    public ResponseEntity<Map<String, String>> getMyBus(@AuthenticationPrincipal Jwt jwt) {
        String username = jwt.getClaimAsString("preferred_username");
        String busCode = driverService.getAssignedBusCode(username);
        return ResponseEntity.ok(Map.of("busCode", busCode));
    }

    @GetMapping
    public ResponseEntity<List<DriverDetailDTO>> getAllDrivers() {
        return ResponseEntity.ok(driverService.getAllDriversDetailed());
    }

    /**
     * Sugere o próximo nº mecanográfico livre para o formulário de criação de utilizador.
     */
    @GetMapping("/next-mechanographic-number")
    public ResponseEntity<Map<String, String>> nextMechanographic() {
        return ResponseEntity.ok(Map.of("mechanographicNumber", driverService.nextMechanographicNumber()));
    }

    @PostMapping
    public ResponseEntity<Driver> createDriver(@RequestBody Driver driver) {
        return ResponseEntity.status(HttpStatus.CREATED).body(driverService.createDriver(driver));
    }

    @PostMapping("/assign")
    public ResponseEntity<Void> assignDriver(@RequestBody DriverAssignmentDTO dto) {
        driverService.assignDriverToBus(dto);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{id}")
    public ResponseEntity<DriverDetailDTO> getDriverById(@PathVariable Long id) {
        Driver driver = driverService.getDriverById(id);
        DriverBusAssignment currentAssignment = driverService.getCurrentAssignment(id);
        return ResponseEntity.ok(DriverDetailDTO.fromDriver(driver, currentAssignment));
    }

    @PostMapping("/unassign")
    public ResponseEntity<Void> unassignDriver(@RequestBody UnassignRequestDTO request) {
        driverService.unassignDriver(request.getDriverId());
        return ResponseEntity.ok().build();
    }

}