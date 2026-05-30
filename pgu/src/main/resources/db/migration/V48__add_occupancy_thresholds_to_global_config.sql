-- Sprint 2 (Vertical 3.4, R.ICP.05): thresholds de ocupacao configuraveis.
--
-- Acrescenta ao global_config os parametros que o AlertaService usa para
-- disparar alertas de ocupacao (onboard/capacidade em %) e de ausencia de
-- dados (bus activo sem reportar ha N minutos):
--   * occupancy_warning_pct     (default 80)
--   * occupancy_critical_pct    (default 95)  -- > warning (validado na app)
--   * occupancy_no_data_minutes (default 10)
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE com COALESCE.

ALTER TABLE global_config
    ADD COLUMN IF NOT EXISTS occupancy_warning_pct      INT,
    ADD COLUMN IF NOT EXISTS occupancy_critical_pct     INT,
    ADD COLUMN IF NOT EXISTS occupancy_no_data_minutes  INT;

UPDATE global_config
SET occupancy_warning_pct     = COALESCE(occupancy_warning_pct, 80),
    occupancy_critical_pct    = COALESCE(occupancy_critical_pct, 95),
    occupancy_no_data_minutes = COALESCE(occupancy_no_data_minutes, 10);

-- Se a tabela estiver vazia (migracao inicial), inserir uma linha com defaults.
INSERT INTO global_config (occupancy_warning_pct, occupancy_critical_pct, occupancy_no_data_minutes)
SELECT 80, 95, 10
WHERE NOT EXISTS (SELECT 1 FROM global_config);
