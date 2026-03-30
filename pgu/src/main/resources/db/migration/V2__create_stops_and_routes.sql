-- ==========================================
-- PARAGENS (Bus Stops)
-- ==========================================
CREATE TABLE bus_stops (
    id          BIGSERIAL       PRIMARY KEY,
    name        VARCHAR(150)    NOT NULL,
    code        VARCHAR(20)     UNIQUE NOT NULL,
    display     VARCHAR(255)    NOT NULL DEFAULT 'N/A',
    location    geometry(Point, 4326) NOT NULL
);

CREATE INDEX idx_stops_location ON bus_stops USING GIST (location);
CREATE INDEX idx_stops_code     ON bus_stops (code);

-- ==========================================
-- ROTAS (Routes / Linhas)
-- ==========================================
CREATE TABLE routes (
    id          BIGSERIAL       PRIMARY KEY,
    name        VARCHAR(150)    NOT NULL,
    code        VARCHAR(20)     UNIQUE NOT NULL,
    color       VARCHAR(7)
);

CREATE INDEX idx_routes_code ON routes (code);
