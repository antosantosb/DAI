
-- 1. Passageiros médios por autocarro (últimas 24h)
CREATE OR REPLACE VIEW v_avg_passengers_per_bus AS
SELECT
    bus_id,
    AVG(passenger_count)   AS avg_passengers,
    MAX(passenger_count)   AS max_passengers,
    COUNT(*)               AS total_readings
FROM vehicle_telemetry
WHERE recorded_at >= NOW() - INTERVAL '24 hours'
GROUP BY bus_id;

-- 2. Distribuição de estados (active/stopped/delayed) por hora
CREATE OR REPLACE VIEW v_status_distribution_hourly AS
SELECT
    DATE_TRUNC('hour', recorded_at) AS hour,
    status,
    COUNT(*) AS count
FROM vehicle_telemetry
GROUP BY 1, 2
ORDER BY 1;

-- 3. Velocidade média por autocarro ao longo do tempo
CREATE OR REPLACE VIEW v_speed_over_time AS
SELECT
    bus_id,
    DATE_TRUNC('minute', recorded_at) AS minute,
    AVG(speed_kmh) AS avg_speed
FROM vehicle_telemetry
GROUP BY 1, 2;

-- 4. Ocupação total da frota ao longo do tempo
CREATE OR REPLACE VIEW v_fleet_occupancy AS
SELECT
    DATE_TRUNC('minute', recorded_at) AS minute,
    SUM(passenger_count)              AS total_passengers,
    COUNT(DISTINCT bus_id)            AS active_buses
FROM vehicle_telemetry
GROUP BY 1
ORDER BY 1;

-- 5. Vista para Heatmaps de Densidade de Passageiros (Agrupado por zonas/geohash ou pontos)
CREATE OR REPLACE VIEW v_heatmap_passenger_density AS
SELECT
    bus_id,
    location,
    ST_AsGeoJSON(location) AS location_json, -- Útil para a camada frontend (Leaflet/Mapbox)
    passenger_count,
    recorded_at
FROM vehicle_telemetry
WHERE passenger_count > 0;

-- 6. Vista para Análise de Congestionamento (Pontos com baixa velocidade e alta ocupação)
CREATE OR REPLACE VIEW v_congestion_analysis AS
SELECT
    bus_id,
    location,
    speed_kmh,
    passenger_count,
    recorded_at
FROM vehicle_telemetry
WHERE speed_kmh < 10 
  AND passenger_count > 20 
  AND status = 'active';

-- 7. Vista para Análise de Rotas e Desvios (Comparação com rota planejada)
CREATE OR REPLACE VIEW v_route_deviation_analysis AS
SELECT
    vt.bus_id,
    vt.recorded_at,
    vt.location,
    vt.status,
    vt.speed_kmh,
    vt.passenger_count
FROM vehicle_telemetry vt
WHERE vt.status = 'delayed';

-- 8. Distribuição do estado operacional (Atrasos) por Rota
CREATE OR REPLACE VIEW v_route_status_delays AS
SELECT
    r.code AS route_code,
    t.status,
    COUNT(*) AS status_count
FROM vehicle_telemetry t
JOIN buses b ON t.bus_id = b.bus_code
JOIN routes r ON b.route_id = r.id
WHERE t.recorded_at >= CURRENT_DATE -- O dia de hoje
GROUP BY r.code, t.status
ORDER BY r.code, status_count DESC;
