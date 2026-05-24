package dai.tub.pgu.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.UserRepresentationDTO;
import dai.tub.pgu.service.DriverService;
import dai.tub.pgu.service.KeycloakAdminService;

/**
 * Endpoints de gestão de utilizadores (proxy para Keycloak Admin API).
 * Apenas acessível pelo role "admin".
 */
@RestController
@RequestMapping("/api/v1/users")
public class UserAdminController
{
    private final KeycloakAdminService keycloakAdminService;
    private final DriverService driverService;

    public UserAdminController(KeycloakAdminService keycloakAdminService, DriverService driverService)
    {
        this.keycloakAdminService = keycloakAdminService;
        this.driverService = driverService;
    }

    @GetMapping
    public ResponseEntity<List<UserRepresentationDTO>> listUsers()
    {
        List<UserRepresentationDTO> users = keycloakAdminService.listUsers();
        return ResponseEntity.ok(users);
    }

    @GetMapping("/{userId}")
    public ResponseEntity<UserRepresentationDTO> getUser(@PathVariable String userId)
    {
        return ResponseEntity.ok(keycloakAdminService.getUser(userId));
    }

    @PostMapping
    @LogActivity(action = "Criar utilizador")
    public ResponseEntity<UserRepresentationDTO> createUser(@RequestBody UserRepresentationDTO dto)
    {
        UserRepresentationDTO created = keycloakAdminService.createUser(dto);

        // Se for motorista, criar também a linha em drivers, atomicamente ligada à conta Keycloak.
        boolean isMotorista = dto.getRoles() != null && dto.getRoles().contains("motorista");
        if (isMotorista) {
            String fullName = String.format("%s %s",
                    dto.getFirstName() != null ? dto.getFirstName() : "",
                    dto.getLastName()  != null ? dto.getLastName()  : "").trim();
            if (fullName.isEmpty()) fullName = dto.getUsername();

            String mecNum = dto.getMechanographicNumber();
            if (mecNum == null || mecNum.isBlank()) {
                mecNum = driverService.nextMechanographicNumber();
            }
            try {
                // Guardamos o username (preferred_username do JWT) em vez do UUID
                // porque o JWT de acesso do Keycloak não popula 'sub' de forma fiável.
                driverService.createDriverForKeycloakUser(
                        created.getUsername(), fullName, mecNum, dto.getPhoneNumber());
            } catch (Exception e) {
                // Rollback: eliminar o user Keycloak para evitar inconsistência
                keycloakAdminService.deleteUser(created.getId());
                throw new RuntimeException("Falha ao criar motorista: " + e.getMessage(), e);
            }
        }

        return ResponseEntity.status(201).body(created);
    }

    @PutMapping("/{userId}")
    @LogActivity(action = "Atualizar utilizador")
    public ResponseEntity<UserRepresentationDTO> updateUser(
        @PathVariable String userId,
        @RequestBody UserRepresentationDTO dto)
    {
        UserRepresentationDTO updated = keycloakAdminService.updateUser(userId, dto);
        return ResponseEntity.ok(updated);
    }

    @PatchMapping("/{userId}/toggle")
    @LogActivity(action = "Ativar/Desativar utilizador")
    public ResponseEntity<Void> toggleEnabled(
        @PathVariable String userId,
        @RequestBody Map<String, Boolean> body)
    {
        boolean enabled = body.getOrDefault("enabled", true);
        keycloakAdminService.toggleUserEnabled(userId, enabled);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{userId}")
    @LogActivity(action = "Eliminar utilizador")
    public ResponseEntity<Void> deleteUser(@PathVariable String userId)
    {
        // Cascata: precisamos do username (não UUID) para localizar o driver
        UserRepresentationDTO user = keycloakAdminService.getUser(userId);
        if (user != null && user.getUsername() != null) {
            driverService.deleteByKeycloakUserId(user.getUsername());
        }
        keycloakAdminService.deleteUser(userId);
        return ResponseEntity.noContent().build();
    }
}
