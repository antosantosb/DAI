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
    /**
     * Sprint 1 follow-up: quando o admin muda o username no Keycloak, a tabela
     * {@code drivers} (que guarda {@code keycloak_user_id = username}) tem de
     * apanhar a mesma alteração — caso contrário o motorista fica desligado
     * da sua conta Keycloak (Painel de Bordo deixa de encontrar o bus
     * atribuído, etc.). Idempotente: se não existir driver ou o username não
     * mudou, não faz nada.
     */
    /**
     * Sprint 1 follow-up: sincroniza {@code driver.status} com o estado
     * {@code enabled} da conta Keycloak. Chamado quando o admin desativa
     * ou reativa um user.
     *  - enabled=false -> driver.status = OFFLINE
     *  - enabled=true  -> driver.status = AVAILABLE (se OFFLINE)
     *
     * <p>Mantém o ON_DUTY se a conta for reativada (motorista a meio de
     * uma viagem que voltou a estar activa). Idempotente.
     */
    @Transactional
    public void syncEnabledStatus(String keycloakUserId, boolean enabled) {
        if (keycloakUserId == null) return;
        driverRepository.findByKeycloakUserId(keycloakUserId).ifPresent(d -> {
            if (!enabled && !"OFFLINE".equals(d.getStatus())) {
                d.setStatus("OFFLINE");
                driverRepository.save(d);
            } else if (enabled && "OFFLINE".equals(d.getStatus())) {
                d.setStatus("AVAILABLE");
                driverRepository.save(d);
            }
        });
    }

    /**
     * Sprint 1 follow-up: verifica se o motorista associado a um Keycloak user
     * está ON_DUTY (a conduzir um autocarro neste momento). Devolve {@code false}
     * se não houver driver associado ou se não estiver em serviço.
     *
     * <p>Usado pelo UserAdminController para bloquear desativar/eliminar uma
     * conta cujo motorista está a meio de uma viagem.
     */
    public boolean isOnDuty(String keycloakUserId) {
        if (keycloakUserId == null) return false;
        return driverRepository.findByKeycloakUserId(keycloakUserId)
                .map(d -> "ON_DUTY".equals(d.getStatus()))
                .orElse(false);
    }

    @Transactional
    public void renameKeycloakUserId(String oldUsername, String newUsername) {
        if (oldUsername == null || newUsername == null) return;
        if (oldUsername.equals(newUsername)) return;
        driverRepository.findByKeycloakUserId(oldUsername).ifPresent(d -> {
            d.setKeycloakUserId(newUsername);
            driverRepository.save(d);
        });
    }

    @Transactional
    public void deleteByKeycloakUserId(String keycloakUserId) {
        driverRepository.findByKeycloakUserId(keycloakUserId).ifPresent(d -> {
            // Sprint 1 follow-up: apagar TODO o historico de assignments antes
            // de apagar o driver. O FK `fk_assignment_driver` nao tem CASCADE,
            // pelo que basta uma linha antiga (active=false) para o DELETE do
            // driver violar a constraint e devolver "Conflito com dados
            // existentes (ex: duplicado, FK)" no UI.
            List<DriverBusAssignment> history =
                    assignmentRepository.findByDriverIdOrderByAssignedAtDesc(d.getId());
            if (!history.isEmpty()) {
                assignmentRepository.deleteAll(history);
            }
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
                // Sprint 1 follow-up: só permitir desatribuir se o autocarro
                // está totalmente parado (STOPPED). Antes só bloqueava ACTIVE,
                // o que deixava passar STOPPING (a parar — bus ainda em
                // movimento na estrada).
                Bus bus = busRepository.findById(assignment.getBusId()).orElse(null);
                if (bus != null && !"STOPPED".equals(bus.getStatus())) {
                    throw new RuntimeException("Não é possível desatribuir o motorista "
                            + driver.getName() + ". O autocarro " + bus.getBusCode()
                            + " ainda não está parado (estado atual: "
                            + bus.getStatus() + "). Pare o autocarro primeiro.");
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