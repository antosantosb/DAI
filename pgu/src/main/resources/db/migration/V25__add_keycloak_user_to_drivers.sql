-- Liga um motorista à conta Keycloak para login no painel de bordo
ALTER TABLE drivers ADD COLUMN keycloak_user_id VARCHAR(100) UNIQUE;
CREATE INDEX idx_drivers_keycloak ON drivers(keycloak_user_id);
