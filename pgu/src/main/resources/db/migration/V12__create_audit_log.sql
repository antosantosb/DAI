CREATE TABLE audit_log (
    id         BIGSERIAL    PRIMARY KEY,
    username   VARCHAR(100) NOT NULL,
    action     VARCHAR(100) NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    method     VARCHAR(100) NOT NULL,
    success    BOOLEAN      NOT NULL DEFAULT TRUE,
    error_msg  TEXT,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX idx_audit_log_user    ON audit_log (username);
