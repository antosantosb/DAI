-- =============================================
-- V18: Campos de simulação e monitorização nos buses
-- battery_pct: percentagem bateria (0-100)
-- delay_minutes: minutos de atraso (negativo = adiantado)
-- breakdown_pct: probabilidade de avaria (0.0-100.0)
-- =============================================

ALTER TABLE buses ADD COLUMN battery_pct    INTEGER DEFAULT 100;
ALTER TABLE buses ADD COLUMN delay_minutes   INTEGER DEFAULT 0;
ALTER TABLE buses ADD COLUMN breakdown_pct   DOUBLE PRECISION DEFAULT 0.0;
