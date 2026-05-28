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
import dai.tub.pgu.service.UserReferenceSyncService;

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
    private final UserReferenceSyncService userReferenceSyncService;

    public UserAdminController(KeycloakAdminService keycloakAdminService,
                               DriverService driverService,
                               AvatarService avatarService,
                               UserReferenceSyncService userReferenceSyncService)
    {
        this.keycloakAdminService = keycloakAdminService;
        this.driverService = driverService;
        this.avatarService = avatarService;
        this.userReferenceSyncService = userReferenceSyncService;
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
        // Sprint 1 follow-up: todas as contas criadas manualmente (funcionário,
        // motorista individual) recebem UPDATE_PASSWORD + CONFIGURE_TOTP como
        // required actions — segue a politica do realm (idêntico ao seed admin).
        // Excepcoes: (a) seed `admin` ja vem no realm.json com estas flags, e
        // (b) seed `dev` que nao tem nenhuma. O batch de motoristas tem o seu
        // proprio endpoint (/drivers/batch) que NAO passa por aqui e e' modo demo.
        dto.setRequiredActions(java.util.List.of("UPDATE_PASSWORD", "CONFIGURE_TOTP"));

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

    // Sprint 1 follow-up: nomes portugueses reais para gerar motoristas de demo.
    // Listas curtas mas suficientes para variedade visivel. Adicionar mais se
    // criarmos batches grandes (>100) num so click.
    private static final List<String> PT_FIRST_NAMES = List.of(
            "Joao", "Maria", "Pedro", "Ana", "Carlos", "Sofia", "Miguel", "Rita",
            "Tiago", "Beatriz", "Andre", "Ines", "Bruno", "Catarina", "Diogo",
            "Mariana", "Ricardo", "Joana", "Goncalo", "Carolina", "Rui", "Marta",
            "Filipe", "Helena", "Hugo", "Sara", "Luis", "Patricia", "Nuno", "Teresa"
    );
    private static final List<String> PT_LAST_NAMES = List.of(
            "Silva", "Santos", "Ferreira", "Pereira", "Costa", "Rodrigues", "Martins",
            "Sousa", "Oliveira", "Carvalho", "Lopes", "Marques", "Goncalves", "Almeida",
            "Ribeiro", "Pinto", "Fernandes", "Mendes", "Nunes", "Cardoso", "Reis",
            "Antunes", "Castro", "Teixeira", "Moreira", "Correia", "Cunha", "Rocha"
    );

    // Sprint 1 follow-up: password fixa para todos os motoristas gerados em
    // batch. Modo demo apenas: em producao real esta funcionalidade vai ficar
    // restrita a conta `developer` (Sprint 1 follow-up #8).
    private static final String BATCH_DRIVER_PASSWORD = "motorista123";

    /**
     * Cria N motoristas em lote com nomes portugueses aleatorios.
     *
     * <p><b>Feature de DEMO/DEV:</b> a password de todos os motoristas gerados
     * e' {@code motorista123}. Documentado no UI.
     *
     * <p>NAO usa required action UPDATE_PASSWORD porque (a) a password e' "publica"
     * para demos, (b) a required action bloqueava o flow de change-password normal
     * pela /backoffice/conta (bug #3 do backlog).
     */
    @PostMapping("/drivers/batch")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('developer')")
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
            String firstName = PT_FIRST_NAMES.get(rng.nextInt(PT_FIRST_NAMES.size()));
            String lastName  = PT_LAST_NAMES.get(rng.nextInt(PT_LAST_NAMES.size()));

            // Username único: motorista_<6 chars alfanuméricos>
            String suffix = randomAlphanumeric(rng, 6);
            String username = "motorista_" + suffix;
            // Password fixa para todos os motoristas gerados (feature de demo).
            String password = BATCH_DRIVER_PASSWORD;

            UserRepresentationDTO dto = new UserRepresentationDTO();
            dto.setUsername(username);
            dto.setEmail((firstName + "." + lastName + "." + suffix + "@tub.local").toLowerCase());
            dto.setFirstName(firstName);
            dto.setLastName(lastName);
            dto.setEnabled(true);
            dto.setPassword(password);
            dto.setRoles(List.of("motorista"));
            // SEM required actions: a password e' valida desde ja.

            try {
                UserRepresentationDTO kcUser = keycloakAdminService.createUser(dto);

                // Criar linha em drivers
                String mecNum = driverService.nextMechanographicNumber();
                String fullName = firstName + " " + lastName;
                try {
                    driverService.createDriverForKeycloakUser(
                            kcUser.getUsername(), fullName, mecNum, null);
                } catch (Exception e) {
                    // Rollback: eliminar o user Keycloak para evitar inconsistência
                    keycloakAdminService.deleteUser(kcUser.getId());
                    throw new RuntimeException("Falha ao criar motorista " + username + ": " + e.getMessage(), e);
                }

                // Auditoria: password do motorista logada (= apelido lowercase).
                log.info("[BATCH-DRIVERS] criado motorista username={} fullName=\"{}\" mecNum={} password={}",
                        username, fullName, mecNum, password);

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
        // Sprint 1 follow-up: politica de update das contas de sistema.
        //   - admin → não pode ser editado por aqui (403).
        //   - dev   → apenas password pode ser alterada; outros campos
        //             (username, nome, email, role, enabled) são ignorados
        //             silenciosamente. Permite ao admin reset password do
        //             dev sem mexer no perfil read-only.
        UserRepresentationDTO target = keycloakAdminService.getUser(userId);
        String oldUsername = target != null ? target.getUsername() : null;
        if (target != null) {
            if (isAdminUser(target)) {
                throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    "A conta admin nao pode ser editada por aqui."
                );
            }
            if (isDevUser(target)) {
                UserRepresentationDTO sanitized = new UserRepresentationDTO();
                sanitized.setPassword(dto.getPassword());
                dto = sanitized;
            }
        }

        UserRepresentationDTO updated = keycloakAdminService.updateUser(userId, dto);

        // Sprint 1 follow-up: se o username mudou, propagar a renomeação em
        // todas as tabelas onde guardamos username como string sem FK.
        //   - drivers.keycloak_user_id (DriverService)
        //   - export_job.requested_by, data_source.owner (UserReferenceSyncService)
        // Tabelas de histórico/audit ficam intencionalmente com o username antigo.
        if (oldUsername != null && updated.getUsername() != null
                && !oldUsername.equals(updated.getUsername())) {
            driverService.renameKeycloakUserId(oldUsername, updated.getUsername());
            userReferenceSyncService.renameUsernameReferences(oldUsername, updated.getUsername());
        }

        avatarService.enrich(updated);
        return ResponseEntity.ok(updated);
    }

    @PatchMapping("/{userId}/toggle")
    @LogActivity(action = "Ativar/Desativar utilizador")
    public ResponseEntity<Void> toggleEnabled(
        @PathVariable String userId,
        @RequestBody Map<String, Boolean> body)
    {
        assertCannotToggle(userId);
        boolean enabled = body.getOrDefault("enabled", true);

        // Sprint 1 follow-up: bloquear desativar conta de motorista a conduzir.
        UserRepresentationDTO target = keycloakAdminService.getUser(userId);
        if (!enabled) {
            assertMotoristaNotOnDuty(target, "desativar");
        }

        keycloakAdminService.toggleUserEnabled(userId, enabled);
        // Sprint 1 follow-up: se for motorista, sincronizar driver.status
        //   - disable -> OFFLINE
        //   - enable  -> AVAILABLE (se estava OFFLINE)
        if (target != null && target.getRoles() != null && target.getRoles().contains("motorista")) {
            driverService.syncEnabledStatus(target.getUsername(), enabled);
        }
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{userId}")
    @LogActivity(action = "Eliminar utilizador")
    public ResponseEntity<Void> deleteUser(@PathVariable String userId)
    {
        assertCannotDelete(userId);
        // Cascata: precisamos do username (não UUID) para localizar o driver
        UserRepresentationDTO user = keycloakAdminService.getUser(userId);

        // Sprint 1 follow-up: bloquear eliminar conta de motorista a conduzir.
        assertMotoristaNotOnDuty(user, "eliminar");

        if (user != null && user.getUsername() != null) {
            driverService.deleteByKeycloakUserId(user.getUsername());
        }
        keycloakAdminService.deleteUser(userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Sprint 1 follow-up: bloqueia desativar/eliminar uma conta cujo motorista
     * está a meio de uma viagem (status ON_DUTY). Evita orfanizar autocarros
     * em movimento. Não faz nada se o user não for motorista.
     */
    private void assertMotoristaNotOnDuty(UserRepresentationDTO user, String operacao) {
        if (user == null || user.getUsername() == null) return;
        if (user.getRoles() == null || !user.getRoles().contains("motorista")) return;
        if (driverService.isOnDuty(user.getUsername())) {
            throw new IllegalStateException(
                "Não é possível " + operacao + " a conta de " + user.getUsername()
                + ": o motorista está actualmente a conduzir um autocarro. "
                + "Pare o autocarro primeiro."
            );
        }
    }

    /**
     * Sprint 1 follow-up: politica de proteção das contas de sistema.
     *
     * <p>
     * <table>
     *   <tr><th>Conta</th><th>Pode ser desativada?</th><th>Pode ser eliminada?</th></tr>
     *   <tr><td>{@code admin}</td><td>NAO (lockout próprio)</td><td>NAO</td></tr>
     *   <tr><td>{@code dev}</td><td>SIM (admin pode desligar a conta demo)</td><td>NAO (singular)</td></tr>
     *   <tr><td>outros</td><td>SIM</td><td>SIM</td></tr>
     * </table>
     */
    private void assertCannotDelete(String userId)
    {
        UserRepresentationDTO user = keycloakAdminService.getUser(userId);
        if (user == null) return;
        if (isAdminUser(user) || isDevUser(user)) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN,
                "Conta de sistema (" + user.getUsername() + ") nao pode ser eliminada."
            );
        }
    }

    private void assertCannotToggle(String userId)
    {
        UserRepresentationDTO user = keycloakAdminService.getUser(userId);
        if (user == null) return;
        if (isAdminUser(user)) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN,
                "A conta admin nao pode ser desativada (lockout próprio)."
            );
        }
    }

    private static boolean isAdminUser(UserRepresentationDTO u)
    {
        return "admin".equalsIgnoreCase(u.getUsername())
                || (u.getRoles() != null && u.getRoles().contains("admin"));
    }

    private static boolean isDevUser(UserRepresentationDTO u)
    {
        return "dev".equalsIgnoreCase(u.getUsername())
                || (u.getRoles() != null && u.getRoles().contains("developer"));
    }
}
