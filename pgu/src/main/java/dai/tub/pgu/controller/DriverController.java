package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    @GetMapping
    public ResponseEntity<List<Driver>> getAllDrivers() {
        return ResponseEntity.ok(driverService.getAllDrivers());
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