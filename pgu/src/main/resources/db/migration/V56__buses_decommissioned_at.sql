-- Regista o instante em que um autocarro foi descomissionado (soft-delete).
-- Preserva o historico ("quando deixou de operar?"); o BusDetailPanel mostra
-- esta data quando abre um bus DECOMMISSIONED.
--
-- Idempotente: IF NOT EXISTS.

ALTER TABLE buses ADD COLUMN IF NOT EXISTS decommissioned_at TIMESTAMPTZ;
