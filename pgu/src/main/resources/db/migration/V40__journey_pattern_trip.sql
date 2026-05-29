-- ============================================================
-- Sprint 1 (Fase 1 / Fundacao): modelo Transmodel.
-- Linha -> Padrao (JourneyPattern) -> Trip -> (Bloco, na V41).
-- Substitui o "padrao representativo unico" (route_stops/route_segments)
-- e absorve o stop_schedule (trip + trip_stop_time). Ver V42 para o DROP.
-- ============================================================

-- JourneyPattern: sequencia distinta de paragens de uma linha (o "canal").
-- Uma linha tem tipicamente 3 a 5 padroes (ida/volta/curtas/variantes).
CREATE TABLE journey_pattern (
    id              BIGSERIAL    PRIMARY KEY,
    route_id        BIGINT       NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    direction_id    INTEGER      NOT NULL DEFAULT 0,
    signature       VARCHAR(64)  NOT NULL,   -- hash dos stop_ids ordenados + direcao (dedup no import)
    name            VARCHAR(255),
    gtfs_import_id  BIGINT       REFERENCES gtfs_import(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_journey_pattern UNIQUE (route_id, signature)
);
CREATE INDEX idx_journey_pattern_route  ON journey_pattern(route_id);
CREATE INDEX idx_journey_pattern_import ON journey_pattern(gtfs_import_id);

-- PatternStop: paragens ordenadas de um padrao (sem horas).
CREATE TABLE pattern_stop (
    id              BIGSERIAL PRIMARY KEY,
    pattern_id      BIGINT    NOT NULL REFERENCES journey_pattern(id) ON DELETE CASCADE,
    stop_id         BIGINT    NOT NULL REFERENCES bus_stops(id) ON DELETE CASCADE,
    stop_sequence   INTEGER   NOT NULL,
    CONSTRAINT uq_pattern_stop UNIQUE (pattern_id, stop_sequence)
);
CREATE INDEX idx_pattern_stop_pattern ON pattern_stop(pattern_id);
CREATE INDEX idx_pattern_stop_stop    ON pattern_stop(stop_id);

-- PatternSegment: geometria entre paragens consecutivas de um padrao.
-- (Computada 1x por par de paragens no import e reutilizada; ver GtfsService.)
CREATE TABLE pattern_segment (
    id              BIGSERIAL PRIMARY KEY,
    pattern_id      BIGINT    NOT NULL REFERENCES journey_pattern(id) ON DELETE CASCADE,
    from_sequence   INTEGER   NOT NULL,
    to_sequence     INTEGER   NOT NULL,
    points          JSONB     NOT NULL,   -- [[lon,lat], ...]
    CONSTRAINT uq_pattern_segment UNIQUE (pattern_id, from_sequence, to_sequence)
);
CREATE INDEX idx_pattern_segment_pattern ON pattern_segment(pattern_id);

-- Trip (ServiceJourney): uma viagem concreta = padrao + service_id (+ hora, via trip_stop_time).
CREATE TABLE trip (
    id              BIGSERIAL    PRIMARY KEY,
    pattern_id      BIGINT       NOT NULL REFERENCES journey_pattern(id) ON DELETE CASCADE,
    route_id        BIGINT       NOT NULL REFERENCES routes(id) ON DELETE CASCADE,  -- denormalizado (= pattern.route_id)
    service_id      VARCHAR(100) NOT NULL,
    headsign        VARCHAR(255),
    gtfs_trip_id    VARCHAR(100) NOT NULL UNIQUE,
    gtfs_import_id  BIGINT       REFERENCES gtfs_import(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trip_pattern ON trip(pattern_id);
CREATE INDEX idx_trip_route   ON trip(route_id);
CREATE INDEX idx_trip_service ON trip(service_id);
CREATE INDEX idx_trip_import  ON trip(gtfs_import_id);

-- TripStopTime (TimetabledPassingTime): as horas de uma trip em cada paragem.
CREATE TABLE trip_stop_time (
    id              BIGSERIAL   PRIMARY KEY,
    trip_id         BIGINT      NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
    stop_id         BIGINT      NOT NULL REFERENCES bus_stops(id) ON DELETE CASCADE,
    stop_sequence   INTEGER     NOT NULL,
    arrival_time    VARCHAR(10) NOT NULL,   -- HH:MM:SS (pode passar das 24h no GTFS)
    departure_time  VARCHAR(10) NOT NULL,
    CONSTRAINT uq_trip_stop_time UNIQUE (trip_id, stop_sequence)
);
CREATE INDEX idx_trip_stop_time_trip ON trip_stop_time(trip_id);
CREATE INDEX idx_trip_stop_time_stop ON trip_stop_time(stop_id);
