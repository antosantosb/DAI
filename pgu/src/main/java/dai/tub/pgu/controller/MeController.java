package dai.tub.pgu.controller;

import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.UserRepresentationDTO;
import dai.tub.pgu.service.AvatarService;
import dai.tub.pgu.service.AvatarService.AvatarValidationException;
import dai.tub.pgu.service.KeycloakAdminService;

/**
 * Self-service de conta: o utilizador logado (qualquer role) pode editar
 * os seus próprios dados sem precisar de ir ao backoffice/Users (admin-only).
 *
 * Endpoints:
 *   GET    /api/v1/me                  → devolve perfil (com avatarUrl presigned)
 *   PATCH  /api/v1/me                  → atualiza firstName/lastName/username/email
 *   POST   /api/v1/me/password         → valida currentPassword e atualiza
 *   POST   /api/v1/me/avatar           → upload de foto de perfil (multipart)
 *   DELETE /api/v1/me/avatar           → remove foto de perfil
 */
@RestController
@RequestMapping("/api/v1/me")
public class MeController
{
    private static final Logger log = LoggerFactory.getLogger(MeController.class);

    private final KeycloakAdminService keycloakAdminService;
    private final AvatarService avatarService;

    public MeController(KeycloakAdminService keycloakAdminService, AvatarService avatarService)
    {
        this.keycloakAdminService = keycloakAdminService;
        this.avatarService = avatarService;
    }

    @GetMapping
    public ResponseEntity<UserRepresentationDTO> getMe(@AuthenticationPrincipal Jwt jwt)
    {
        String username = jwt.getClaimAsString("preferred_username");
        UserRepresentationDTO dto = keycloakAdminService.findUserByUsername(username);
        if (dto == null) {
            return ResponseEntity.notFound().build();
        }
        // Nunca expor password no GET
        dto.setPassword(null);
        avatarService.enrich(dto);
        return ResponseEntity.ok(dto);
    }

    @PatchMapping
    @LogActivity(action = "Atualizar conta propria")
    public ResponseEntity<UserRepresentationDTO> updateMe(
        @AuthenticationPrincipal Jwt jwt,
        @RequestBody Map<String, String> body)
    {
        String currentUsername = jwt.getClaimAsString("preferred_username");
        UserRepresentationDTO current = keycloakAdminService.findUserByUsername(currentUsername);
        if (current == null) {
            return ResponseEntity.notFound().build();
        }

        // Construir DTO apenas com os campos que o user pode alterar.
        // Roles, enabled, mechanographicNumber e password ficam intocados aqui.
        UserRepresentationDTO patch = new UserRepresentationDTO();
        patch.setFirstName(body.getOrDefault("firstName", current.getFirstName()));
        patch.setLastName(body.getOrDefault("lastName", current.getLastName()));
        patch.setEmail(body.getOrDefault("email", current.getEmail()));
        patch.setEnabled(current.isEnabled());
        // Username: se vier no body e for diferente, tentar mudar (Keycloak suporta
        // apenas se a opção "Edit username" estiver activa no realm).
        String newUsername = body.get("username");
        if (newUsername != null && !newUsername.isBlank() && !newUsername.equals(currentUsername)) {
            patch.setUsername(newUsername);
        }

        UserRepresentationDTO updated = keycloakAdminService.updateUserSelf(current.getId(), patch);
        updated.setPassword(null);
        avatarService.enrich(updated);
        log.info("[ME] {} atualizou perfil", currentUsername);
        return ResponseEntity.ok(updated);
    }

    /**
     * Upload de foto de perfil. Aceita PNG/JPG/WEBP ate 2MB.
     * Devolve a presigned URL do avatar atualizado.
     */
    @PostMapping("/avatar")
    @LogActivity(action = "Atualizar foto de perfil")
    public ResponseEntity<Map<String, Object>> uploadAvatar(
        @AuthenticationPrincipal Jwt jwt,
        @RequestParam("file") MultipartFile file)
    {
        String username = jwt.getClaimAsString("preferred_username");
        UserRepresentationDTO me = keycloakAdminService.findUserByUsername(username);
        if (me == null) {
            return ResponseEntity.notFound().build();
        }

        Map<String, Object> response = new HashMap<>();
        try {
            String url = avatarService.uploadAvatar(me.getId(), file);
            response.put("success", true);
            response.put("avatarUrl", url);
            log.info("[ME] {} atualizou foto de perfil", username);
            return ResponseEntity.ok(response);
        } catch (AvatarValidationException e) {
            response.put("success", false);
            response.put("error", e.getCode());
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        } catch (Exception e) {
            log.error("[ME] falha a fazer upload de avatar para {}", username, e);
            response.put("success", false);
            response.put("error", "upload_failed");
            response.put("message", e.getMessage());
            return ResponseEntity.internalServerError().body(response);
        }
    }

    /**
     * Apaga a foto de perfil do user logado.
     */
    @DeleteMapping("/avatar")
    @LogActivity(action = "Remover foto de perfil")
    public ResponseEntity<Void> deleteAvatar(@AuthenticationPrincipal Jwt jwt)
    {
        String username = jwt.getClaimAsString("preferred_username");
        UserRepresentationDTO me = keycloakAdminService.findUserByUsername(username);
        if (me == null) {
            return ResponseEntity.notFound().build();
        }
        avatarService.deleteAvatar(me.getId());
        log.info("[ME] {} removeu foto de perfil", username);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password")
    @LogActivity(action = "Mudar password propria")
    public ResponseEntity<Map<String, Object>> changePassword(
        @AuthenticationPrincipal Jwt jwt,
        @RequestBody Map<String, String> body)
    {
        String username = jwt.getClaimAsString("preferred_username");
        String currentPassword = body.get("currentPassword");
        String newPassword = body.get("newPassword");

        Map<String, Object> response = new HashMap<>();

        if (currentPassword == null || currentPassword.isBlank()
            || newPassword == null || newPassword.isBlank()) {
            response.put("success", false);
            response.put("error", "missing_fields");
            return ResponseEntity.badRequest().body(response);
        }

        // 1) Validar password atual via password grant ao Keycloak.
        boolean valid = keycloakAdminService.validateUserPassword(username, currentPassword);
        if (!valid) {
            response.put("success", false);
            response.put("error", "current_password_wrong");
            return ResponseEntity.status(401).body(response);
        }

        // 2) Atualizar password via Admin API.
        UserRepresentationDTO me = keycloakAdminService.findUserByUsername(username);
        if (me == null) {
            response.put("success", false);
            response.put("error", "user_not_found");
            return ResponseEntity.notFound().build();
        }
        keycloakAdminService.setUserPassword(me.getId(), newPassword);
        log.info("[ME] {} mudou password", username);

        response.put("success", true);
        return ResponseEntity.ok(response);
    }
}
