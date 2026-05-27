package dai.tub.pgu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dai.tub.pgu.dto.UserRepresentationDTO;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;

/**
 * Serviço que interage com a Keycloak Admin REST API.
 * Usa client credentials do client "admin-cli" (ou service account dedicado).
 */
@Service
public class KeycloakAdminService
{
    private static final Logger log = LoggerFactory.getLogger(KeycloakAdminService.class);

    private final RestClient restClient;
    private final ObjectMapper mapper;

    @Value("${pgu.keycloak.server-url:http://keycloak:8080/auth}")
    private String keycloakUrl;

    @Value("${pgu.keycloak.realm:pgu-realm}")
    private String realm;

    @Value("${pgu.keycloak.admin-username:admin}")
    private String adminUsername;

    @Value("${pgu.keycloak.admin-password:admin}")
    private String adminPassword;

    // Roles que o sistema reconhece (para filtrar roles internas do Keycloak)
    private static final List<String> SYSTEM_ROLES = List.of("admin", "operador", "motorista");

    public KeycloakAdminService()
    {
        this.restClient = RestClient.create();
        this.mapper = new ObjectMapper();
    }

    /**
     * Obtém access token do admin realm (master) via Resource Owner Password Credentials.
     */
    private String getAdminToken()
    {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "password");
        form.add("client_id", "admin-cli");
        form.add("username", adminUsername);
        form.add("password", adminPassword);

        String tokenUrl = keycloakUrl + "/realms/master/protocol/openid-connect/token";

        String body = restClient.post()
            .uri(tokenUrl)
            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .body(form)
            .retrieve()
            .body(String.class);

        try {
            JsonNode json = mapper.readTree(body);
            return json.get("access_token").asText();
        } catch (Exception e) {
            throw new RuntimeException("Falha ao obter token do Keycloak Admin", e);
        }
    }

    private String adminApiBase()
    {
        return keycloakUrl + "/admin/realms/" + realm;
    }

    /**
     * Lista todos os utilizadores do realm.
     */
    public List<UserRepresentationDTO> listUsers()
    {
        String token = getAdminToken();

        String body = restClient.get()
            .uri(adminApiBase() + "/users?max=100")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
            .retrieve()
            .body(String.class);

        try {
            JsonNode users = mapper.readTree(body);
            List<UserRepresentationDTO> result = new ArrayList<>();
            for (JsonNode u : users) {
                UserRepresentationDTO dto = mapUserNode(u);
                // Buscar roles do utilizador
                dto.setRoles(getUserRoles(token, dto.getId()));
                result.add(dto);
            }
            return result;
        } catch (Exception e) {
            throw new RuntimeException("Erro ao listar utilizadores", e);
        }
    }

    /**
     * Obtém um utilizador por ID.
     */
    public UserRepresentationDTO getUser(String userId)
    {
        String token = getAdminToken();

        String body = restClient.get()
            .uri(adminApiBase() + "/users/" + userId)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
            .retrieve()
            .body(String.class);

        try {
            JsonNode u = mapper.readTree(body);
            UserRepresentationDTO dto = mapUserNode(u);
            dto.setRoles(getUserRoles(token, userId));
            return dto;
        } catch (Exception e) {
            throw new RuntimeException("Erro ao obter utilizador", e);
        }
    }

    /**
     * Cria um novo utilizador.
     */
    public UserRepresentationDTO createUser(UserRepresentationDTO request)
    {
        String token = getAdminToken();

        ObjectNode payload = mapper.createObjectNode();
        payload.put("username", request.getUsername());
        payload.put("email", request.getEmail());
        payload.put("firstName", request.getFirstName() != null ? request.getFirstName() : "");
        payload.put("lastName", request.getLastName() != null ? request.getLastName() : "");
        payload.put("enabled", request.isEnabled());

        // Definir password
        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            ArrayNode credentials = mapper.createArrayNode();
            ObjectNode cred = mapper.createObjectNode();
            cred.put("type", "password");
            cred.put("value", request.getPassword());
            cred.put("temporary", false);
            credentials.add(cred);
            payload.set("credentials", credentials);
        }

        // Required actions (ex.: UPDATE_PASSWORD para forçar mudança no primeiro login).
        if (request.getRequiredActions() != null && !request.getRequiredActions().isEmpty()) {
            ArrayNode actions = mapper.createArrayNode();
            for (String a : request.getRequiredActions()) actions.add(a);
            payload.set("requiredActions", actions);
        }

        try {
            // Criar utilizador
            ResponseEntity<Void> response = restClient.post()
                .uri(adminApiBase() + "/users")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(payload))
                .retrieve()
                .toBodilessEntity();

            // Extrair ID do header Location
            String location = response.getHeaders().getFirst(HttpHeaders.LOCATION);
            String userId = location != null ? location.substring(location.lastIndexOf('/') + 1) : null;

            if (userId == null) {
                throw new RuntimeException("Não foi possível obter o ID do utilizador criado");
            }

            // Atribuir roles
            if (request.getRoles() != null && !request.getRoles().isEmpty()) {
                assignRoles(token, userId, request.getRoles());
            }

            return getUser(userId);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("409")) {
                throw new RuntimeException("Já existe um utilizador com este username ou email");
            }
            throw new RuntimeException("Erro ao criar utilizador: " + e.getMessage(), e);
        }
    }

    /**
     * Procura um utilizador pelo username (exact match).
     * Devolve null se não existir.
     */
    public UserRepresentationDTO findUserByUsername(String username)
    {
        if (username == null || username.isBlank()) return null;
        String token = getAdminToken();

        try {
            String body = restClient.get()
                .uri(adminApiBase() + "/users?username=" + username + "&exact=true")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .body(String.class);

            JsonNode users = mapper.readTree(body);
            if (!users.isArray() || users.size() == 0) return null;
            UserRepresentationDTO dto = mapUserNode(users.get(0));
            dto.setRoles(getUserRoles(token, dto.getId()));
            return dto;
        } catch (Exception e) {
            throw new RuntimeException("Erro a procurar utilizador por username", e);
        }
    }

    /**
     * Atualiza um utilizador existente — variante para self-service /me.
     * Permite tentar mudar username (depende da config do realm).
     * Não toca em roles nem em password.
     */
    public UserRepresentationDTO updateUserSelf(String userId, UserRepresentationDTO request)
    {
        String token = getAdminToken();

        ObjectNode payload = mapper.createObjectNode();
        if (request.getUsername() != null && !request.getUsername().isBlank()) {
            payload.put("username", request.getUsername());
        }
        if (request.getEmail() != null) payload.put("email", request.getEmail());
        if (request.getFirstName() != null) payload.put("firstName", request.getFirstName());
        if (request.getLastName() != null) payload.put("lastName", request.getLastName());
        payload.put("enabled", request.isEnabled());

        try {
            restClient.put()
                .uri(adminApiBase() + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(payload))
                .retrieve()
                .toBodilessEntity();

            return getUser(userId);
        } catch (Exception e) {
            throw new RuntimeException("Erro ao atualizar utilizador (self): " + e.getMessage(), e);
        }
    }

    /**
     * Valida uma password fazendo um password-grant ao Keycloak com o client
     * publico do backoffice. Não usamos o admin token — queremos saber se as
     * credenciais do utilizador são realmente válidas.
     */
    public boolean validateUserPassword(String username, String password)
    {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "password");
        form.add("client_id", "pgu-backoffice");
        form.add("username", username);
        form.add("password", password);

        String tokenUrl = keycloakUrl + "/realms/" + realm + "/protocol/openid-connect/token";

        try {
            restClient.post()
                .uri(tokenUrl)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(String.class);
            return true;
        } catch (Exception e) {
            // 401/400 = credenciais inválidas; tudo o resto também conta como falha
            return false;
        }
    }

    /**
     * Define directamente a password de um utilizador via Admin API.
     * Wrapper público sobre o helper privado resetPassword.
     */
    public void setUserPassword(String userId, String newPassword)
    {
        String token = getAdminToken();
        resetPassword(token, userId, newPassword);
    }

    /**
     * Atualiza um utilizador existente.
     */
    public UserRepresentationDTO updateUser(String userId, UserRepresentationDTO request)
    {
        String token = getAdminToken();

        ObjectNode payload = mapper.createObjectNode();
        // username é read-only no Keycloak — não incluir no PUT
        if (request.getEmail() != null) payload.put("email", request.getEmail());
        if (request.getFirstName() != null) payload.put("firstName", request.getFirstName());
        if (request.getLastName() != null) payload.put("lastName", request.getLastName());
        payload.put("enabled", request.isEnabled());

        try {
            restClient.put()
                .uri(adminApiBase() + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(payload))
                .retrieve()
                .toBodilessEntity();

            // Reset password se fornecido
            if (request.getPassword() != null && !request.getPassword().isBlank()) {
                resetPassword(token, userId, request.getPassword());
            }

            // Atualizar roles se fornecidas
            if (request.getRoles() != null) {
                updateRoles(token, userId, request.getRoles());
            }

            return getUser(userId);
        } catch (Exception e) {
            throw new RuntimeException("Erro ao atualizar utilizador: " + e.getMessage(), e);
        }
    }

    /**
     * Desativa (enabled=false) ou reativa um utilizador.
     */
    public void toggleUserEnabled(String userId, boolean enabled)
    {
        String token = getAdminToken();
        ObjectNode payload = mapper.createObjectNode();
        payload.put("enabled", enabled);

        try {
            restClient.put()
                .uri(adminApiBase() + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(payload))
                .retrieve()
                .toBodilessEntity();
        } catch (Exception e) {
            throw new RuntimeException("Erro ao alterar estado do utilizador", e);
        }
    }

    /**
     * Elimina um utilizador por ID.
     */
    public void deleteUser(String userId)
    {
        String token = getAdminToken();
        try {
            restClient.delete()
                .uri(adminApiBase() + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .toBodilessEntity();
        } catch (Exception e) {
            throw new RuntimeException("Erro ao eliminar utilizador: " + e.getMessage(), e);
        }
    }

    // ─── Roles ───────────────────────────────────────────────────────

    private List<String> getUserRoles(String token, String userId)
    {
        String body = restClient.get()
            .uri(adminApiBase() + "/users/" + userId + "/role-mappings/realm")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
            .retrieve()
            .body(String.class);

        try {
            JsonNode roles = mapper.readTree(body);
            List<String> result = new ArrayList<>();
            for (JsonNode r : roles) {
                String name = r.get("name").asText();
                if (SYSTEM_ROLES.contains(name)) {
                    result.add(name);
                }
            }
            return result;
        } catch (Exception e) {
            return List.of();
        }
    }

    private void assignRoles(String token, String userId, List<String> roleNames)
    {
        List<JsonNode> availableRoles = getAvailableRealmRoles(token);
        ArrayNode rolesToAssign = mapper.createArrayNode();

        for (String roleName : roleNames) {
            for (JsonNode r : availableRoles) {
                if (r.get("name").asText().equals(roleName)) {
                    rolesToAssign.add(r);
                    break;
                }
            }
        }

        if (rolesToAssign.isEmpty()) return;

        try {
            restClient.post()
                .uri(adminApiBase() + "/users/" + userId + "/role-mappings/realm")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(rolesToAssign))
                .retrieve()
                .toBodilessEntity();
        } catch (Exception e) {
            throw new RuntimeException("Erro ao atribuir roles", e);
        }
    }

    private void updateRoles(String token, String userId, List<String> desiredRoles)
    {
        // Remover roles atuais do sistema, depois atribuir as desejadas
        List<String> currentRoles = getUserRoles(token, userId);
        List<JsonNode> availableRoles = getAvailableRealmRoles(token);

        // Roles a remover
        ArrayNode toRemove = mapper.createArrayNode();
        for (String current : currentRoles) {
            if (!desiredRoles.contains(current)) {
                for (JsonNode r : availableRoles) {
                    if (r.get("name").asText().equals(current)) {
                        toRemove.add(r);
                        break;
                    }
                }
            }
        }

        if (!toRemove.isEmpty()) {
            try {
                restClient.method(HttpMethod.DELETE)
                    .uri(adminApiBase() + "/users/" + userId + "/role-mappings/realm")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(mapper.writeValueAsString(toRemove))
                    .retrieve()
                    .toBodilessEntity();
            } catch (Exception e) {
                // log warning
            }
        }

        // Roles a adicionar
        List<String> toAdd = new ArrayList<>();
        for (String desired : desiredRoles) {
            if (!currentRoles.contains(desired)) {
                toAdd.add(desired);
            }
        }
        if (!toAdd.isEmpty()) {
            assignRoles(token, userId, toAdd);
        }
    }

    private List<JsonNode> getAvailableRealmRoles(String token)
    {
        String body = restClient.get()
            .uri(adminApiBase() + "/roles")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
            .retrieve()
            .body(String.class);

        try {
            JsonNode roles = mapper.readTree(body);
            List<JsonNode> result = new ArrayList<>();
            for (JsonNode r : roles) {
                result.add(r);
            }
            return result;
        } catch (Exception e) {
            return List.of();
        }
    }

    private void resetPassword(String token, String userId, String newPassword)
    {
        ObjectNode payload = mapper.createObjectNode();
        payload.put("type", "password");
        payload.put("value", newPassword);
        payload.put("temporary", false);

        try {
            restClient.put()
                .uri(adminApiBase() + "/users/" + userId + "/reset-password")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(payload))
                .retrieve()
                .toBodilessEntity();
        } catch (Exception e) {
            throw new RuntimeException("Erro ao redefinir password", e);
        }
    }

    // ─── Avatar (Keycloak user attributes) ───────────────────────────

    /**
     * Atualiza o atributo "avatarKey" de um utilizador Keycloak.
     * Passa {@code null} ou string vazia para remover o atributo.
     */
    /**
     * Sprint 0 (follow-up): em Keycloak 24+ a User Profile rejeita atributos
     * nao declarados por defeito. Sem isto, o {@link #setAvatarKey} aparenta
     * funcionar (PUT 204) mas o attribute "avatarKey" e' silenciosamente
     * filtrado e nao persiste — apos refresh o avatar desaparece.
     *
     * <p>Solucao: PUT em {@code /users/profile} com
     * {@code unmanagedAttributePolicy=ENABLED}. Idempotent — corre uma vez no
     * boot. Best-effort: se falhar (ex. Keycloak ainda nao up), apenas loga.
     */
    @PostConstruct
    public void ensureUnmanagedAttributesEnabled()
    {
        try {
            String token = getAdminToken();
            String url = adminApiBase() + "/users/profile";
            String body = restClient.get()
                .uri(url)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .body(String.class);
            JsonNode current = mapper.readTree(body);
            String policy = current.path("unmanagedAttributePolicy").asText("");
            if ("ENABLED".equals(policy) || "ADMIN_EDIT".equals(policy) || "ADMIN_VIEW".equals(policy)) {
                log.info("Keycloak unmanagedAttributePolicy ja' em {} — skip", policy);
                return;
            }
            ObjectNode updated = (ObjectNode) current;
            updated.put("unmanagedAttributePolicy", "ENABLED");
            restClient.put()
                .uri(url)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(updated))
                .retrieve()
                .toBodilessEntity();
            log.info("Keycloak unmanagedAttributePolicy set to ENABLED (permite avatarKey)");
        } catch (Exception e) {
            log.warn("Nao foi possivel garantir unmanagedAttributePolicy=ENABLED: {}", e.getMessage());
        }
    }

    public void setAvatarKey(String userId, String avatarKey)
    {
        String token = getAdminToken();

        // Para preservar os outros atributos, vamos buscar o user atual e
        // fazer merge — caso contrario um PUT com attributes={avatarKey:...}
        // apagaria todos os outros atributos eventualmente existentes.
        JsonNode current = fetchUserRaw(token, userId);

        ObjectNode payload = mapper.createObjectNode();
        ObjectNode attributes = mapper.createObjectNode();

        if (current != null && current.has("attributes") && current.get("attributes").isObject()) {
            current.get("attributes").fields().forEachRemaining(entry -> {
                if (!"avatarKey".equals(entry.getKey())) {
                    attributes.set(entry.getKey(), entry.getValue());
                }
            });
        }

        if (avatarKey != null && !avatarKey.isBlank()) {
            ArrayNode values = mapper.createArrayNode();
            values.add(avatarKey);
            attributes.set("avatarKey", values);
        }

        payload.set("attributes", attributes);

        try {
            restClient.put()
                .uri(adminApiBase() + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(payload))
                .retrieve()
                .toBodilessEntity();
        } catch (Exception e) {
            throw new RuntimeException("Erro ao atualizar avatarKey do utilizador", e);
        }
    }

    /**
     * Devolve o avatarKey atual de um utilizador (atributo Keycloak) ou {@code null}.
     */
    public String getAvatarKey(String userId)
    {
        String token = getAdminToken();
        JsonNode u = fetchUserRaw(token, userId);
        return extractAvatarKey(u);
    }

    private JsonNode fetchUserRaw(String token, String userId)
    {
        try {
            String body = restClient.get()
                .uri(adminApiBase() + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .body(String.class);
            return mapper.readTree(body);
        } catch (Exception e) {
            return null;
        }
    }

    private String extractAvatarKey(JsonNode u)
    {
        if (u == null) return null;
        if (!u.has("attributes") || !u.get("attributes").isObject()) return null;
        JsonNode attrs = u.get("attributes");
        if (!attrs.has("avatarKey")) return null;
        JsonNode arr = attrs.get("avatarKey");
        if (arr.isArray() && arr.size() > 0) return arr.get(0).asText();
        if (arr.isTextual()) return arr.asText();
        return null;
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private UserRepresentationDTO mapUserNode(JsonNode u)
    {
        UserRepresentationDTO dto = new UserRepresentationDTO();
        dto.setId(u.get("id").asText());
        dto.setUsername(u.has("username") ? u.get("username").asText() : null);
        dto.setEmail(u.has("email") ? u.get("email").asText() : null);
        dto.setFirstName(u.has("firstName") ? u.get("firstName").asText() : null);
        dto.setLastName(u.has("lastName") ? u.get("lastName").asText() : null);
        dto.setEnabled(u.has("enabled") && u.get("enabled").asBoolean());
        dto.setCreatedTimestamp(u.has("createdTimestamp") && !u.get("createdTimestamp").isNull()
            ? u.get("createdTimestamp").asLong() : null);
        dto.setAvatarKey(extractAvatarKey(u));
        return dto;
    }
}
