package dai.tub.pgu.controller;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.UserRepresentationDTO;
import dai.tub.pgu.service.AvatarService;
import dai.tub.pgu.service.DriverService;
import dai.tub.pgu.service.KeycloakAdminService;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * Endpoints de gestão de utilizadores (proxy para Keycloak Admin API).
 * Apenas acessível pelo role "admin".
 */
@RestController
@RequestMapping("/api/v1/users")
public class UserAdminController
{
    private static final Logger log = LoggerFactory.getLogger(UserAdminController.class);

    private final KeycloakAdminService keycloakAdminService;
    private final DriverService driverService;
    private final AvatarService avatarService;

    public UserAdminController(KeycloakAdminService keycloakAdminService,
                               DriverService driverService,
                               AvatarService avatarService)
    {
        this.keycloakAdminService = keycloakAdminService;
        this.driverService = driverService;
        this.avatarService = avatarService;
    }

    @GetMapping
    public ResponseEntity<List<UserRepresentationDTO>> listUsers()
    {
        List<UserRepresentationDTO> users = keycloakAdminService.listUsers();
        users.forEach(avatarService::enrich);
        return ResponseEntity.ok(users);
    }

    @GetMapping("/{userId}")
    public ResponseEntity<UserRepresentationDTO> getUser(@PathVariable String userId)
    {
        UserRepresentationDTO user = keycloakAdminService.getUser(userId);
        avatarService.enrich(user);
        return ResponseEntity.ok(user);
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

    /**
     * Cria N motoristas em lote com dados aleatórios.
     * Cada um terá de mudar a password no primeiro login (required action UPDATE_PASSWORD).
     * Username: motorista_<sufixo aleatório>; Password temporária aleatória (logada para auditoria).
     */
    @PostMapping("/drivers/batch")
    @LogActivity(action = "Criar motoristas em batch")
    public ResponseEntity<List<UserRepresentationDTO>> createDriversBatch(
            @RequestParam(defaultValue = "5")
            @Min(value = 1, message = "Quantidade minima e 1")
            @Max(value = 50, message = "Quantidade maxima e 50")
            int count)
    {
        SecureRandom rng = new SecureRandom();
        List<UserRepresentationDTO> created = new ArrayList<>();

        for (int i = 0; i < count; i++) {
            // Username único: motorista_<6 chars alfanuméricos>
            String suffix = randomAlphanumeric(rng, 6);
            String username = "motorista_" + suffix;
            String tempPassword = randomPassword(rng);

            UserRepresentationDTO dto = new UserRepresentationDTO();
            dto.setUsername(username);
            dto.setEmail(username + "@tub.local");
            dto.setFirstName("Motorista");
            dto.setLastName(suffix.toUpperCase());
            dto.setEnabled(true);
            dto.setPassword(tempPassword);
            dto.setRoles(List.of("motorista"));
            dto.setRequiredActions(List.of("UPDATE_PASSWORD"));

            try {
                UserRepresentationDTO kcUser = keycloakAdminService.createUser(dto);

                // Criar linha em drivers
                String mecNum = driverService.nextMechanographicNumber();
                String fullName = dto.getFirstName() + " " + dto.getLastName();
                try {
                    driverService.createDriverForKeycloakUser(
                            kcUser.getUsername(), fullName, mecNum, null);
                } catch (Exception e) {
                    // Rollback: eliminar o user Keycloak para evitar inconsistência
                    keycloakAdminService.deleteUser(kcUser.getId());
                    throw new RuntimeException("Falha ao criar motorista " + username + ": " + e.getMessage(), e);
                }

                // Auditoria: password temporária logada (não retornada ao cliente)
                log.info("[BATCH-DRIVERS] criado motorista username={} mecNum={} tempPassword={}",
                        username, mecNum, tempPassword);

                // Limpar campos sensíveis antes de retornar
                kcUser.setPassword(null);
                created.add(kcUser);
            } catch (Exception e) {
                log.error("[BATCH-DRIVERS] falha a criar motorista {}: {}", username, e.getMessage());
                // Continuar com os restantes; a falha individual não bloqueia o batch
            }
        }

        return ResponseEntity.status(201).body(created);
    }

    private static String randomAlphanumeric(SecureRandom rng, int len)
    {
        final String chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) sb.append(chars.charAt(rng.nextInt(chars.length())));
        return sb.toString();
    }

    private static String randomPassword(SecureRandom rng)
    {
        // 12 chars: maiúscula + minúscula + dígito + símbolo garantidos
        final String upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        final String lower = "abcdefghijkmnpqrstuvwxyz";
        final String digits = "23456789";
        final String symbols = "!@#$%&*";
        final String all = upper + lower + digits + symbols;
        StringBuilder sb = new StringBuilder(12);
        sb.append(upper.charAt(rng.nextInt(upper.length())));
        sb.append(lower.charAt(rng.nextInt(lower.length())));
        sb.append(digits.charAt(rng.nextInt(digits.length())));
        sb.append(symbols.charAt(rng.nextInt(symbols.length())));
        for (int i = 0; i < 8; i++) sb.append(all.charAt(rng.nextInt(all.length())));
        return sb.toString();
    }

    @PutMapping("/{userId}")
    @LogActivity(action = "Atualizar utilizador")
    public ResponseEntity<UserRepresentationDTO> updateUser(
        @PathVariable String userId,
        @RequestBody UserRepresentationDTO dto)
    {
        UserRepresentationDTO updated = keycloakAdminService.updateUser(userId, dto);
        avatarService.enrich(updated);
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
