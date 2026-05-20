package dai.tub.pgu.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.domain.Driver;
import dai.tub.pgu.domain.DriverBusAssignment;
import dai.tub.pgu.dto.DriverAssignmentDTO;
import dai.tub.pgu.repository.DriverBusAssignmentRepository;
import dai.tub.pgu.repository.DriverRepository;

@Service
public class DriverService {

    private final DriverRepository driverRepository;
    private final DriverBusAssignmentRepository assignmentRepository;

    public DriverService(DriverRepository driverRepository, DriverBusAssignmentRepository assignmentRepository) {
        this.driverRepository = driverRepository;
        this.assignmentRepository = assignmentRepository;
    }

    public List<Driver> getAllDrivers() {
        return driverRepository.findAll();
    }

    public Driver createDriver(Driver driver) {
        return driverRepository.save(driver);
    }

    // Get driver by ID with validation
    public Driver getDriverById(Long id) {
        return driverRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Driver not found with id: " + id));
    }

    // Get current assignment (returns null if none)
    public DriverBusAssignment getCurrentAssignment(Long driverId) {
        return assignmentRepository.findByDriverIdAndActiveTrue(driverId).orElse(null);
    }

    // Unassign driver (end current active assignment)
    @Transactional
    public void unassignDriver(Long driverId) {
        Driver driver = getDriverById(driverId);
    
        assignmentRepository.findByDriverIdAndActiveTrue(driverId)
            .ifPresent(assignment -> {
                assignment.deactivate();
                assignmentRepository.save(assignment);
            });
    
        driver.setStatus("AVAILABLE");
        driverRepository.save(driver);
    }

    // Get assignment history for a driver
    public List<DriverBusAssignment> getAssignmentHistory(Long driverId) {
        // Ensure driver exists
        getDriverById(driverId);
        return assignmentRepository.findByDriverIdOrderByAssignedAtDesc(driverId);
    }

    @Transactional
    public void assignDriverToBus(DriverAssignmentDTO dto) {
        Driver driver = driverRepository.findById(dto.getDriverId())
                .orElseThrow(() -> new IllegalArgumentException("Motorista não encontrado com o ID: " + dto.getDriverId()));

        // 1. Terminar qualquer associação ativa que este autocarro já tivesse
        assignmentRepository.findByBusIdAndActiveTrue(dto.getBusId())
                .ifPresent(oldAssignment -> {
                    oldAssignment.deactivate();
                    oldAssignment.getDriver().setStatus("AVAILABLE");
                    driverRepository.save(oldAssignment.getDriver());
                });

        // 2. Terminar qualquer associação ativa que este motorista já tivesse noutro autocarro
        assignmentRepository.findByDriverIdAndActiveTrue(driver.getId())
                .ifPresent(DriverBusAssignment::deactivate);

        // 3. Criar a nova associação ativa
        DriverBusAssignment newAssignment = new DriverBusAssignment(driver, dto.getBusId());
        assignmentRepository.save(newAssignment);

        // 4. Atualizar o estado do motorista para em serviço
        driver.setStatus("ON_DUTY");
        driverRepository.save(driver);
    }
}