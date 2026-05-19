-- =============================================
-- V17: Tabela de horarios GTFS (stop_times)
-- Guarda arrival/departure por rota+paragem+trip
-- =============================================

CREATE TABLE stop_schedule (
    id              BIGSERIAL PRIMARY KEY,
    route_id        BIGINT      NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    stop_id         BIGINT      NOT NULL REFERENCES bus_stops(id) ON DELETE CASCADE,
    trip_id         VARCHAR(100) NOT NULL,
    arrival_time    VARCHAR(10) NOT NULL,   -- formato HH:MM:SS (pode ter >24h no GTFS)
    departure_time  VARCHAR(10) NOT NULL,
    stop_sequence   INTEGER     NOT NULL,
    direction_id    INTEGER     DEFAULT 0,
    service_id      VARCHAR(100),
    gtfs_import_id  BIGINT      REFERENCES gtfs_import(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Indices para queries frequentes
CREATE INDEX idx_stop_schedule_route   ON stop_schedule(route_id);
CREATE INDEX idx_stop_schedule_stop    ON stop_schedule(stop_id);
CREATE INDEX idx_stop_schedule_import  ON stop_schedule(gtfs_import_id);
CREATE INDEX idx_stop_schedule_trip    ON stop_schedule(trip_id);
CREATE INDEX idx_stop_schedule_lookup  ON stop_schedule(stop_id, route_id, direction_id);
