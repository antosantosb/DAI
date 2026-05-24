package dai.tub.pgu.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.Driver;
import dai.tub.pgu.domain.DriverBusAssignment;
import dai.tub.pgu.dto.DriverAssignmentDTO;
import dai.tub.pgu.dto.DriverDetailDTO;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.DriverBusAssignmentRepository;
import dai.tub.pgu.repository.DriverRepository;

@Service
public class DriverService {

    private final DriverRepository driverRepository;
    private final DriverBusAssignmentRepository assignmentRepository;
    private final BusRepository busRepository;

    public DriverService(DriverRepository driverRepository,
                         DriverBusAssignmentRepository assignmentRepository,
                         BusRepository busRepository) {
        this.driverRepository = driverRepository;
        this.assignmentRepository = assignmentRepository;
        this.busRepository = busRepository;
    }

    /**
     * Devolve o Driver associado a um Keycloak user (login do painel de bordo).
     */
    public Driver getByKeycloakUserId(String keycloakUserId) {
        return driverRepository.findByKeycloakUserId(keycloakUserId)
                .orElseThrow(() -> new RuntimeException("Nenhum motorista associado a esta conta."));
    }

    /**
     * Devolve o busCode do autocarro atribuído ao motorista autenticado.
     */
    public String getAssignedBusCode(String keycloakUserId) {
        Driver driver = getByKeycloakUserId(keycloakUserId);
        DriverBusAssignment assignment = assignmentRepository.findByDriverIdAndActiveTrue(driver.getId())
                .orElseThrow(() -> new RuntimeException("Nenhum autocarro atribuído de momento."));
        Bus bus = busRepository.findById(assignment.getBusId())
                .orElseThrow(() -> new RuntimeException("Autocarro não encontrado."));
        return bus.getBusCode();
    }

    public List<Driver> getAllDrivers() {
        return driverRepository.findAll();
    }

    /**
     * Sugere o próximo nº mecanográfico livre (formato M-001, M-002, ...).
     * Procura pelo maior número já existente e incrementa.
     */
    public String nextMechanographicNumber() {
        int maxNum = driverRepository.findAll().stream()
                .map(Driver::getMechanographicNumber)
                .filter(s -> s != null && s.startsWith("M-"))
                .map(s -> s.substring(2))
                .map(s -> { try { return Integer.parseInt(s); } catch (NumberFormatException e) { return 0; } })
                .max(Integer::compare)
                .orElse(0);
        return String.format("M-%03d", maxNum + 1);
    }

    /**
     * Cria um Driver associado a um Keycloak user já existente.
     * Usado em conjunto com a criação atómica via UserAdminController.
     */
    @Transactional
    public Driver createDriverForKeycloakUser(String keycloakUserId, String name,
                                              String mechanographicNumber, String phoneNumber) {
        Driver d = new Driver(name, mechanographicNumber, phoneNumber);
        d.setKeycloakUserId(keycloakUserId);
        return driverRepository.save(d);
    }

    /**
     * Elimina o Driver associado a um Keycloak user (cascata de delete do user).
     * Idempotente — não falha se não houver driver associado.
     */
    @Transactional
    public void deleteByKeycloakUserId(String keycloakUserId) {
        driverRepository.findByKeycloakUserId(keycloakUserId).ifPresent(d -> {
            // Desativar qualquer assignment ativo antes de eliminar
            assignmentRepository.findByDriverIdAndActiveTrue(d.getId()).ifPresent(a -> {
                a.deactivate();
                assignmentRepository.save(a);
            });
            driverRepository.delete(d);
        });
    }

    /**
     * Devolve todos os drivers enriquecidos com info de assignment ativo (para a UI Motoristas).
     */
    public List<DriverDetailDTO> getAllDriversDetailed() {
        return driverRepository.findAll().stream()
                .map(d -> {
                    DriverBusAssignment a = getCurrentAssignment(d.getId());
                    Bus bus = (a != null) ? busRepository.findById(a.getBusId()).orElse(null) : null;
                    return DriverDetailDTO.fromDriver(d, a, bus);
                })
                .toList();
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
                // Regra: não desatribuir motorista de autocarro em andamento
                Bus bus = busRepository.findById(assignment.getBusId()).orElse(null);
                if (bus != null && "ACTIVE".equals(bus.getStatus())) {
                    throw new RuntimeException("Não é possível desatribuir o motorista "
                            + driver.getName() + " — o autocarro " + bus.getBusCode()
                            + " está em andamento. Pare o autocarro primeiro.");
                }
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