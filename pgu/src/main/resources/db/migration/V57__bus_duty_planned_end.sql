-- Adiciona planned_end a bus_duty para mostrar a hora de chegada de cada trip
-- (hora da ultima paragem). Calculado ao criar a escala (createDuty).
-- Nullable para nao falhar com duties legados (ficam sem fim, frontend tolera).

ALTER TABLE bus_duty ADD COLUMN IF NOT EXISTS planned_end TIMESTAMPTZ;
