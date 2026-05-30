-- Sprint 2 (Vertical 3.4, R.ICP.01): contagem automatica de passageiros (APC).
--
-- A telemetria passa a transportar as tres grandezas que um sistema APC real
-- (sensores nas portas) produz por paragem:
--   * boarded  : entradas na ultima paragem (>= 0)
--   * alighted : saidas na ultima paragem (>= 0)
--   * onboard  : ocupacao instantanea a bordo (>= 0, limitada pela capacidade)
--
-- passenger_count mantem-se por compatibilidade com tudo o que ja existe
-- (analytics, heatmap, congestion, dashboards). A ingestao garante que, na
-- ausencia destes campos novos, onboard = passenger_count (fallback), pelo que
-- nenhum produtor antigo (NiFi/simulador nao actualizados) parte a ingestao.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS permite re-correr sem falhar.

ALTER TABLE vehicle_telemetry
    ADD COLUMN IF NOT EXISTS boarded  INTEGER,
    ADD COLUMN IF NOT EXISTS alighted INTEGER,
    ADD COLUMN IF NOT EXISTS onboard  INTEGER;

-- Backfill: para as linhas historicas, onboard espelha o passenger_count
-- conhecido; boarded/alighted ficam a 0 (nao ha forma de os reconstruir).
UPDATE vehicle_telemetry
SET onboard  = COALESCE(onboard, passenger_count),
    boarded  = COALESCE(boarded, 0),
    alighted = COALESCE(alighted, 0)
WHERE onboard IS NULL OR boarded IS NULL OR alighted IS NULL;
