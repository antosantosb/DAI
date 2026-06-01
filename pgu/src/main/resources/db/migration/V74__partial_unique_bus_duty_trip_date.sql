-- ============================================================
-- V74: Tornar o UNIQUE (trip_id, service_date) em bus_duty parcial.
-- ============================================================
--
-- Problema: o constraint `uq_bus_duty_trip_date` (V53) bloqueia QUALQUER
-- segunda atribuicao de uma trip ao mesmo dia, mesmo que a duty existente
-- ja esteja DONE/CANCELLED/INTERRUPTED. Isto impede o caso legitimo:
--
--   - O bus X fez uma trip T no dia D (duty = DONE).
--   - Mais tarde queremos planear de novo o bus X (ou outro bus) para
--     refazer essa trip — mas o constraint nao deixa, falhando o INSERT
--     com "duplicate key value violates unique constraint
--     uq_bus_duty_trip_date" -> traduzido como "Conflito com dados
--     existentes (FK)".
--
-- Fix: substituir o constraint por um INDEX UNIQUE PARCIAL que so' aplica
-- quando a duty esta activa (PLANNED ou RUNNING). Duties terminadas
-- (DONE, CANCELLED, INTERRUPTED) podem coexistir com novas activas para
-- a mesma trip no mesmo dia.
-- ============================================================

ALTER TABLE bus_duty DROP CONSTRAINT IF EXISTS uq_bus_duty_trip_date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bus_duty_trip_date_active
    ON bus_duty (trip_id, service_date)
    WHERE status IN ('PLANNED', 'RUNNING');
