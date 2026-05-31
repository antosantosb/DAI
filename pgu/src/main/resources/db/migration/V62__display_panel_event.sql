-- Sprint 3 (3.5): historico de eventos dos paineis DMS.
-- Cada heartbeat / mudanca de status / mensagem publicada / alarme gera
-- 1 row. Base para calculo de uptime e dashboard de falhas.
CREATE TABLE IF NOT EXISTS display_panel_event (
    id            BIGSERIAL PRIMARY KEY,
    panel_id      BIGINT      NOT NULL REFERENCES display_panel(id) ON DELETE CASCADE,
    ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type    VARCHAR(20) NOT NULL CHECK (event_type IN (
                      'HEARTBEAT','STATUS_CHANGE','MESSAGE_PUBLISHED',
                      'MESSAGE_CLEARED','ALARM')),
    status        VARCHAR(16),
    battery_pct   SMALLINT,
    temperature_c NUMERIC(4,1),
    message       VARCHAR(256),
    detail        VARCHAR(256)
);
CREATE INDEX idx_panel_event_panel_ts ON display_panel_event(panel_id, ts DESC);
CREATE INDEX idx_panel_event_type_ts  ON display_panel_event(event_type, ts DESC);

COMMENT ON TABLE display_panel_event IS 'Historico de eventos dos paineis DMS (Sprint 3).';
