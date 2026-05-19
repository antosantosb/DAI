package dai.tub.pgu.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.UserRepresentationDTO;
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

    public UserAdminController(KeycloakAdminService keycloakAdminService)
    {
        this.keycloakAdminService = keycloakAdminService;
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
        keycloakAdminService.deleteUser(userId);
        return ResponseEntity.noContent().build();
    }
}
