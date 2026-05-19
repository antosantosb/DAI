CREATE TABLE global_config (
    id SERIAL PRIMARY KEY,
    delay_limit_minutes INT NOT NULL DEFAULT 5,
    soc_tolerance_percent INT NOT NULL DEFAULT 10,
    iot_integration_limit INT NOT NULL DEFAULT 1000,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255)
);

INSERT INTO global_config (delay_limit_minutes, soc_tolerance_percent, iot_integration_limit) 
VALUES (5, 10, 1000);