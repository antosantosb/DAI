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
import dai.tub.pgu.dto.UserRepresentationDTO;
import dai.tub.pgu.dto.DriverDepartureDTO;
import dai.tub.pgu.service.AvatarService;
import dai.tub.pgu.service.DriverDepartureService;
import dai.tub.pgu.service.DriverService;
import dai.tub.pgu.service.KeycloakAdminService;

@RestController
@RequestMapping("/api/v1/drivers")
public class DriverController {

    private final DriverService driverService;
    private final AvatarService avatarService;
    private final KeycloakAdminService keycloakAdminService;
    private final DriverDepartureService driverDepartureService;

    public DriverController(DriverService driverService,
                            AvatarService avatarService,
                            KeycloakAdminService keycloakAdminService,
                            DriverDepartureService driverDepartureService) {
        this.driverService = driverService;
        this.avatarService = avatarService;
        this.keycloakAdminService = keycloakAdminService;
        this.driverDepartureService = driverDepartureService;
    }

    /**
     * Enriquece com presigned URL do avatar. Nota: no domain Driver o campo
     * {@code keycloakUserId} guarda na verdade o {@code username} (ver
     * UserAdminController.createUser), por isso precisamos de fazer lookup
     * por username para obter o UUID Keycloak e depois o atributo avatarKey.
     */
    private DriverDetailDTO enrichAvatar(DriverDetailDTO dto) {
        if (dto == null || dto.getKeycloakUserId() == null) return dto;
        try {
            UserRepresentationDTO kc = keycloakAdminService.findUserByUsername(dto.getKeycloakUserId());
            if (kc != null) {
                dto.setAvatarUrl(avatarService.urlForKey(kc.getAvatarKey()));
            }
        } catch (Exception ignored) {
            // best-effort; avatar nao e' critico
        }
        return dto;
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

    /**
     * "Hora X" do motorista: instante em que tem de sair da central TUB para
     * chegar a tempo a' primeira paragem da primeira trip de hoje. Combina
     * distancia OSRM com a velocidade media da frota (ultimos 7 dias).
     */
    @GetMapping("/me/departure")
    public ResponseEntity<DriverDepartureDTO> getMyDeparture(@AuthenticationPrincipal Jwt jwt) {
        String username = jwt.getClaimAsString("preferred_username");
        return ResponseEntity.ok(driverDepartureService.computeForDriver(username));
    }

    @GetMapping
    public ResponseEntity<List<DriverDetailDTO>> getAllDrivers() {
        List<DriverDetailDTO> drivers = driverService.getAllDriversDetailed();
        drivers.forEach(this::enrichAvatar);
        return ResponseEntity.ok(drivers);
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
        DriverDetailDTO dto = DriverDetailDTO.fromDriver(driver, currentAssignment);
        return ResponseEntity.ok(enrichAvatar(dto));
    }

    @PostMapping("/unassign")
    public ResponseEntity<Void> unassignDriver(@RequestBody UnassignRequestDTO request) {
        driverService.unassignDriver(request.getDriverId());
        return ResponseEntity.ok().build();
    }

}