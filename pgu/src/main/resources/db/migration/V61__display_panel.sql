-- Sprint 3 (3.5): Painéis de Mensagem Dinâmica (DMS).
-- Cada painel fisico (e-paper/LED/TFT) numa paragem TUB. O backoffice
-- gere o inventario; o simulador (em ausencia de hardware real) publica
-- heartbeats periodicos em tub/panels/heartbeat.
CREATE TABLE IF NOT EXISTS display_panel (
    id                          BIGSERIAL PRIMARY KEY,
    code                        VARCHAR(32)  NOT NULL UNIQUE,                -- serial fisico
    name                        VARCHAR(128) NOT NULL,
    type                        VARCHAR(16)  NOT NULL CHECK (type IN ('EPAPER','LED','TFT')),
    stop_id                     BIGINT       NOT NULL REFERENCES bus_stops(id) ON DELETE CASCADE,
    status                      VARCHAR(16)  NOT NULL DEFAULT 'UNKNOWN'
                                 CHECK (status IN ('ONLINE','OFFLINE','FAULTY','LOW_BATTERY','UNKNOWN','DISABLED')),
    last_heartbeat              TIMESTAMPTZ  NULL,
    battery_pct                 SMALLINT     NULL,                            -- so' EPAPER (solar); NULL em LED/TFT
    temperature_c               NUMERIC(4,1) NULL,
    firmware_version            VARCHAR(32),
    current_message             VARCHAR(256),                                 -- conteudo afixado
    content_source              VARCHAR(16)  NOT NULL DEFAULT 'DEFAULT_ETA'
                                 CHECK (content_source IN ('DEFAULT_ETA','OPERATOR_MSG','SERVICE_ALERT')),
    heartbeat_interval_seconds  INT          NOT NULL DEFAULT 30,
    offline_threshold_seconds   INT          NOT NULL DEFAULT 300,            -- 5 min sem heartbeat = OFFLINE
    battery_warning_pct         SMALLINT     NOT NULL DEFAULT 30,
    battery_critical_pct        SMALLINT     NOT NULL DEFAULT 15,
    enabled                     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_panel_status ON display_panel(status);
CREATE INDEX idx_panel_type   ON display_panel(type);
CREATE INDEX idx_panel_stop   ON display_panel(stop_id);

COMMENT ON TABLE  display_panel IS 'Inventario de paineis DMS nas paragens (Sprint 3).';
COMMENT ON COLUMN display_panel.code IS 'Serial fisico do dispositivo; usado pelo simulador no MQTT.';
