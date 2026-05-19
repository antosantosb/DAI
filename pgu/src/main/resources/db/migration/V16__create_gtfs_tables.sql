-- ============================================================
-- GTFS Management — tabelas de controlo de importações
-- ============================================================

-- Histórico de importações GTFS (manuais + automáticas)
CREATE TABLE gtfs_import (
    id              BIGSERIAL PRIMARY KEY,
    source          VARCHAR(20)  NOT NULL,          -- 'UPLOAD', 'TUB_MANUAL', 'TUB_SCHEDULED'
    status          VARCHAR(20)  NOT NULL DEFAULT 'PROCESSING', -- 'PROCESSING','COMPLETED','FAILED','REVERTED'
    filename        VARCHAR(255),
    stops_created   INTEGER      NOT NULL DEFAULT 0,
    stops_updated   INTEGER      NOT NULL DEFAULT 0,
    routes_created  INTEGER      NOT NULL DEFAULT 0,
    routes_updated  INTEGER      NOT NULL DEFAULT 0,
    shapes_loaded   INTEGER      NOT NULL DEFAULT 0,
    error_message   TEXT,
    created_by      VARCHAR(100),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    reverted_at     TIMESTAMPTZ
);

-- IDs das entidades criadas por cada importação (para rollback)
CREATE TABLE gtfs_import_entity (
    id              BIGSERIAL PRIMARY KEY,
    import_id       BIGINT       NOT NULL REFERENCES gtfs_import(id) ON DELETE CASCADE,
    entity_type     VARCHAR(20)  NOT NULL,          -- 'STOP', 'ROUTE', 'ROUTE_STOP', 'SEGMENT'
    entity_id       BIGINT       NOT NULL
);

CREATE INDEX idx_gtfs_import_entity_import ON gtfs_import_entity(import_id);
CREATE INDEX idx_gtfs_import_created       ON gtfs_import(created_at DESC);

-- Configuração do agendamento TUB
CREATE TABLE gtfs_config (
    id              BIGSERIAL PRIMARY KEY,
    schedule_active BOOLEAN      NOT NULL DEFAULT FALSE,
    interval_hours  INTEGER      NOT NULL DEFAULT 24,
    gtfs_url        VARCHAR(500) NOT NULL DEFAULT 'https://www.tub.pt/developer/gtfs/feed/tub.zip',
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Inserir config default
INSERT INTO gtfs_config (schedule_active, interval_hours) VALUES (FALSE, 24);
