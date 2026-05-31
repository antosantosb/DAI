-- "Hora X" no painel de bordo do motorista: regista quando o motorista
-- realmente clicou Iniciar (actual_start_at) e o tipo de partida em relacao a
-- Hora X (EARLY: antes da Hora X; ON_TIME: no segundo zero; LATE: depois).
-- Aplica-se a PRIMEIRA duty PLANNED da escala do dia.

ALTER TABLE bus_duty ADD COLUMN IF NOT EXISTS actual_start_at TIMESTAMPTZ;
ALTER TABLE bus_duty ADD COLUMN IF NOT EXISTS departure_type VARCHAR(16);
