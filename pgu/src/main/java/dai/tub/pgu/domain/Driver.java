package dai.tub.pgu.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "drivers")
public class Driver {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "mechanographic_number", nullable = false, unique = true, length = 20)
    private String mechanographicNumber;

    @Column(name = "phone_number", length = 15)
    private String phoneNumber;

    @Column(nullable = false)
    private String status = "AVAILABLE"; // AVAILABLE, ON_DUTY, OFFLINE

    @Column(name = "keycloak_user_id", unique = true, length = 100)
    private String keycloakUserId;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt = Instant.now();

    // Construtores
    public Driver() {}

    public Driver(String name, String mechanographicNumber, String phoneNumber) {
        this.name = name;
        this.mechanographicNumber = mechanographicNumber;
        this.phoneNumber = phoneNumber;
        this.status = "AVAILABLE";
        this.createdAt = Instant.now();
    }

    // Getters e Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getMechanographicNumber() { return mechanographicNumber; }
    public void setMechanographicNumber(String mechanographicNumber) { this.mechanographicNumber = mechanographicNumber; }

    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }

    public String getKeycloakUserId() { return keycloakUserId; }
    public void setKeycloakUserId(String keycloakUserId) { this.keycloakUserId = keycloakUserId; }
}