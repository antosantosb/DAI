-- ──────────────────────────────────────────────────────────────────────
--  V9 — Correções aos Analytics Views (auditoria UI backoffice)
--
--  Fixes:
--   #1  v_fleet_occupancy filtra só últimas 2h (performance)
--   #2  Rótulos de tempo em fuso Europe/Lisbon (não UTC)
--   #3  Rótulos incluem data curta (evita colisões entre dias)
--   #4  v_route_status_delays passa a ser pivot por rota (colunas active/delayed/stopped)
--   #5  v_heatmap_passenger_density agregado em grid espacial (~50m)
-- ──────────────────────────────────────────────────────────────────────

-- Postgres não permite reordenar/renomear colunas num CREATE OR REPLACE VIEW.
-- Como V6 criou estas views com layout diferente, derrubamo-las primeiro.
DROP VIEW IF EXISTS v_fleet_occupancy          CASCADE;
DROP VIEW IF EXISTS v_route_status_delays      CASCADE;
DROP VIEW IF EXISTS v_heatmap_passenger_density CASCADE;

-- #1 #2 #3 — Ocupação da frota por minuto, últimas 2 horas, fuso local.
-- Sub-agregação por (bus, minuto) com AVG para evitar contar o mesmo passageiro
-- várias vezes devido à taxa de amostragem (~5s). Depois soma entre autocarros.
CREATE OR REPLACE VIEW v_fleet_occupancy AS
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

-- #4 — Estados por rota pivotados: uma linha por rota, colunas por estado
--     (No dia corrente.) Permite barras empilhadas no frontend sem duplicar rótulos.
CREATE OR REPLACE VIEW v_route_status_delays AS
SELECT
    r.code                                                      AS route_code,
    COUNT(*) FILTER (WHERE t.status = 'active')                 AS active_count,
    COUNT(*) FILTER (WHERE t.status = 'at-stop')                AS at_stop_count,
    COUNT(*) FILTER (WHERE t.status = 'stopping')               AS stopping_count,
    COUNT(*) FILTER (WHERE t.status = 'delayed')                AS delayed_count,
    COUNT(*) FILTER (WHERE t.status = 'stopped')                AS stopped_count,
    COUNT(*)                                                    AS total_count
FROM vehicle_telemetry t
JOIN buses  b ON t.bus_id   = b.bus_code
JOIN routes r ON b.route_id = r.id
WHERE t.recorded_at >= CURRENT_DATE
GROUP BY r.code
ORDER BY r.code;

-- #5 — Heatmap com agregação espacial (~50m) + temporal (últimas 2h).
--     Reduz drasticamente cardinalidade face à versão crua.
CREATE OR REPLACE VIEW v_heatmap_passenger_density AS
SELECT
    ST_Y(ST_SnapToGrid(location, 0.0005))   AS lat,   -- ~55m à latitude de Braga
    ST_X(ST_SnapToGrid(location, 0.0005))   AS lng,
    SUM(passenger_count)::int               AS passenger_count,
    COUNT(*)                                AS samples
FROM vehicle_telemetry
WHERE passenger_count > 0
  AND recorded_at >= NOW() - INTERVAL '2 hours'
GROUP BY 1, 2;
