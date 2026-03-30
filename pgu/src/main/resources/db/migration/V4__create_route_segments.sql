-- Pontos intermédios das estradas entre paragens consecutivas (OSRM)
CREATE TABLE route_segments (
    id              BIGSERIAL PRIMARY KEY,
    route_id        BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    from_stop_order INTEGER NOT NULL,
    to_stop_order   INTEGER NOT NULL,
    points          JSONB NOT NULL,  -- [[lat, lon], [lat, lon], ...]
    UNIQUE (route_id, from_stop_order, to_stop_order)
);
