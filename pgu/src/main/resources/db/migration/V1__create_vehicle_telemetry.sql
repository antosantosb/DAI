-- Ativa a extensão PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Tabela principal de telemetria dos veículos
CREATE TABLE vehicle_telemetry
(
    id              BIGSERIAL       PRIMARY KEY,
    bus_id          VARCHAR(50)     NOT NULL,
    location        geometry(Point, 4326) NOT NULL,
    passenger_count INTEGER,
    speed_kmh       DOUBLE PRECISION,
    recorded_at     TIMESTAMPTZ     NOT NULL,
    status          VARCHAR(20)     NOT NULL,
    next_stop       VARCHAR(150),
    stops_remaining INTEGER
);

-- Índice espacial para queries geográficas (ex: autocarros num raio)
CREATE INDEX idx_telemetry_location ON vehicle_telemetry USING GIST (location);

-- Índice para queries por veículo
CREATE INDEX idx_telemetry_bus_id ON vehicle_telemetry (bus_id);

-- Índice para queries temporais
CREATE INDEX idx_telemetry_recorded_at ON vehicle_telemetry (recorded_at);
