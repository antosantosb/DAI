package dai.tub.pgu.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "audit_log")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String username;
    private String action;
    private String className;
    private String method;
    private boolean success;
    private String errorMsg;
    private LocalDateTime createdAt;

    public AuditLog() {}

    public AuditLog(String username, String action, String className, String method, boolean success, String errorMsg) {
        this.username = username;
        this.action = action;
        this.className = className;
        this.method = method;
        this.success = success;
        this.errorMsg = errorMsg;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getAction() { return action; }
    public String getClassName() { return className; }
    public String getMethod() { return method; }
    public boolean isSuccess() { return success; }
    public String getErrorMsg() { return errorMsg; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
