-- ──────────────────────────────────────────────────────────────────────
--  V14 — Melhora v_congestion_analysis
--
--  Problemas:
--   A) speed_kmh < 10 filtrava quase tudo a ~0 km/h → vel. média inútil
--   B) Faltava nome da rota para contexto no frontend
--   C) Sem filtro temporal → performance
--
--  Solução: relaxar para < 15, juntar rota, filtrar últimas 2h na view.
-- ──────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS v_congestion_analysis CASCADE;

CREATE VIEW v_congestion_analysis AS
SELECT
    vt.bus_id,
    vt.location,
    vt.speed_kmh,
    vt.passenger_count,
    vt.recorded_at,
    r.code  AS route_code,
    r.name  AS route_name
FROM vehicle_telemetry vt
JOIN buses  b ON vt.bus_id   = b.bus_code
JOIN routes r ON b.route_id  = r.id
WHERE vt.speed_kmh < 15
  AND vt.passenger_count > 10
  AND vt.status = 'active'
  AND vt.recorded_at >= NOW() - INTERVAL '2 hours';
