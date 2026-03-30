-- ==========================================
-- PARAGENS POR ROTA (ordem das paragens)
-- ==========================================
CREATE TABLE route_stops (
    id          BIGSERIAL   PRIMARY KEY,
    route_id    BIGINT      NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    stop_id     BIGINT      NOT NULL REFERENCES bus_stops(id) ON DELETE CASCADE,
    stop_order  INTEGER     NOT NULL,
    UNIQUE (route_id, stop_order)
);

CREATE INDEX idx_route_stops_route ON route_stops (route_id);

-- ==========================================
-- AUTOCARROS (Buses)
-- ==========================================
CREATE TABLE buses (
    id              BIGSERIAL       PRIMARY KEY,
    bus_code        VARCHAR(50)     UNIQUE NOT NULL,
    license_plate   VARCHAR(20),
    capacity        INTEGER,
    route_id        BIGINT          REFERENCES routes(id) ON DELETE SET NULL,
    status          VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE'
);

CREATE INDEX idx_buses_code     ON buses (bus_code);
CREATE INDEX idx_buses_route    ON buses (route_id);
