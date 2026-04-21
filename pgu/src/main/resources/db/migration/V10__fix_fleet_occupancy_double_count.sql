-- ──────────────────────────────────────────────────────────────────────
--  V10 — Corrige v_fleet_occupancy
--
--  Bugs:
--   A) SUM(passenger_count) contava o mesmo passageiro ~12×/min
--      (há ~12 amostras/bus/min a 5s de intervalo). Ex: 2 autocarros
--      com 95 pax davam "2280" em vez de ~190.
--   B) Rótulo "DD HH24:MI" mostrava dia-do-mês a baralhar o eixo quando
--      a janela é de 2h. Passa a "HH24:MI".
--
--  Solução: sub-agregação AVG(passenger_count) por (bus, minuto),
--  depois SUM entre autocarros para ocupação instantânea da frota.
-- ──────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS v_fleet_occupancy CASCADE;

CREATE VIEW v_fleet_occupancy AS
WITH per_bus_minute AS (
    SELECT
        DATE_TRUNC('minute', recorded_at)           AS minute,
        bus_id,
        AVG(passenger_count)::numeric               AS avg_pax
    FROM vehicle_telemetry
    WHERE recorded_at >= NOW() - INTERVAL '2 hours'
    GROUP BY 1, 2
)
SELECT
    minute,
    TO_CHAR(minute AT TIME ZONE 'Europe/Lisbon', 'HH24:MI') AS minute_label,
    ROUND(SUM(avg_pax))::bigint                     AS total_passengers,
    COUNT(DISTINCT bus_id)                          AS active_buses
FROM per_bus_minute
GROUP BY minute
ORDER BY minute;
