-- Sprint 0 (F4): gestao de fontes de dados (R.ID.01-09).
--
-- Cada componente externo (simulador, NiFi, Orion, MQTT, GTFS, etc.) e' uma
-- "fonte de dados" com estado de saude, contacto do responsavel, metricas
-- de uptime e historico de pulses. O DataSourceHealthService monitoriza
-- pulses periodicos; se a fonte deixar de enviar pulse, passa a DEGRADED
-- e depois DOWN, disparando alerta critico via AlertaService.

CREATE TABLE data_source (
    id                          BIGSERIAL PRIMARY KEY,
    nome                        VARCHAR(64)  NOT NULL UNIQUE,
    tipo                        VARCHAR(32)  NOT NULL,                     -- SIMULATOR, NIFI, ORION, MQTT, GTFS, ...
    descricao                   VARCHAR(512),
    owner                       VARCHAR(64),
    contacto_email              VARCHAR(128),
    contacto_telefone           VARCHAR(32),
    status                      VARCHAR(16)  NOT NULL DEFAULT 'UNKNOWN',   -- HEALTHY, DEGRADED, DOWN, UNKNOWN, DISABLED
    last_sync                   TIMESTAMPTZ,
    uptime_pct_24h              NUMERIC(5,2),
    uptime_pct_7d               NUMERIC(5,2),
    config_json                 JSONB,
    enabled                     BOOLEAN      NOT NULL DEFAULT TRUE,
    pulse_interval_seconds      INT          NOT NULL DEFAULT 60,
    degraded_threshold_seconds  INT          NOT NULL DEFAULT 180,
    down_threshold_seconds      INT          NOT NULL DEFAULT 300,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_source_status ON data_source(status);
CREATE INDEX idx_data_source_tipo   ON data_source(tipo);

-- Historico de pulses (audit trail + base para calculo de uptime)
CREATE TABLE data_source_pulse (
    id              BIGSERIAL PRIMARY KEY,
    data_source_id  BIGINT       NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
    ts              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status          VARCHAR(16)  NOT NULL,
    detalhes        TEXT
);

CREATE INDEX idx_dsp_data_source_ts ON data_source_pulse(data_source_id, ts DESC);

-- Sementes iniciais (componentes conhecidos)
INSERT INTO data_source (nome, tipo, descricao, owner, contacto_email, status, pulse_interval_seconds, degraded_threshold_seconds, down_threshold_seconds)
VALUES
  ('Simulador de Telemetria', 'SIMULATOR', 'Simulador Python que publica telemetria MQTT periodica', 'Equipa DAI', 'dai@uminho.pt', 'UNKNOWN',     5,   60,  180),
  ('Apache NiFi',             'NIFI',      'Pipeline ETL: MQTT -> backend + Orion',                    'Equipa DAI', 'dai@uminho.pt', 'UNKNOWN',    60,  180,  300),
  ('FIWARE Orion',            'ORION',     'Context broker NGSI-LD',                                   'Equipa DAI', 'dai@uminho.pt', 'UNKNOWN',    60,  180,  300),
  ('Mosquitto MQTT',          'MQTT',      'Broker MQTT com autenticacao por servico',                 'Equipa DAI', 'dai@uminho.pt', 'UNKNOWN',    60,  180,  300),
  ('GTFS TUB',                'GTFS',      'Carga periodica do GTFS dos TUB',                          'Equipa DAI', 'dai@uminho.pt', 'UNKNOWN', 86400, 172800, 259200);
