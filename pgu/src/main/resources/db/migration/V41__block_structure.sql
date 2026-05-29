-- ============================================================
-- Sprint 1 (Fase 1): estrutura de blocos (vehicle block / GTFS block_id).
-- Tabelas criadas agora; populadas na Fase 4 (o feed TUB nao tem block_id,
-- por isso os blocos sao construidos, nao importados).
-- ============================================================

-- Block: cadeia de trips que um autocarro executa num dia de servico.
CREATE TABLE block (
    id              BIGSERIAL    PRIMARY KEY,
    code            VARCHAR(100),
    service_id      VARCHAR(100),
    operator_id     BIGINT       REFERENCES operators(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_block_service ON block(service_id);

-- BlockTrip: trips de um bloco, por ordem de execucao.
CREATE TABLE block_trip (
    id              BIGSERIAL PRIMARY KEY,
    block_id        BIGINT    NOT NULL REFERENCES block(id) ON DELETE CASCADE,
    trip_id         BIGINT    NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
    trip_order      INTEGER   NOT NULL,
    CONSTRAINT uq_block_trip UNIQUE (block_id, trip_order)
);
CREATE INDEX idx_block_trip_block ON block_trip(block_id);
CREATE INDEX idx_block_trip_trip  ON block_trip(trip_id);

-- Autocarro -> bloco que executa (populado na Fase 4).
ALTER TABLE buses ADD COLUMN block_id BIGINT REFERENCES block(id) ON DELETE SET NULL;
CREATE INDEX idx_buses_block ON buses(block_id);
