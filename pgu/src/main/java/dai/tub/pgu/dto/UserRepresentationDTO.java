package dai.tub.pgu.dto;

import java.util.List;

/**
 * DTO para representar um utilizador Keycloak no frontend.
 */
public class UserRepresentationDTO
{
    private String id;
    private String username;
    private String email;
    private String firstName;
    private String lastName;
    private boolean enabled;
    private List<String> roles;
    private Long createdTimestamp;

    // Password só é usado na criação/atualização (nunca retornado)
    private String password;

    // Campos específicos para utilizadores com role 'motorista'.
    // Só usados quando o role criado/listado é motorista.
    private String mechanographicNumber;
    private String phoneNumber;

    public UserRepresentationDTO() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }

    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public List<String> getRoles() { return roles; }
    public void setRoles(List<String> roles) { this.roles = roles; }

    public Long getCreatedTimestamp() { return createdTimestamp; }
    public void setCreatedTimestamp(Long createdTimestamp) { this.createdTimestamp = createdTimestamp; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getMechanographicNumber() { return mechanographicNumber; }
    public void setMechanographicNumber(String mechanographicNumber) { this.mechanographicNumber = mechanographicNumber; }

    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
}
