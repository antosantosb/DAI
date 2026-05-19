package dai.tub.pgu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dai.tub.pgu.dto.UserRepresentationDTO;
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
    private static final List<String> SYSTEM_ROLES = List.of("admin", "funcionario");

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
        return dto;
    }
}
