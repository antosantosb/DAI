-- ============================================================
-- Sprint 1 (F4): Calendário operacional (R.IVT.05)
-- Importa o calendar.txt e calendar_dates.txt do GTFS, que mapeiam
-- cada service_id aos dias em que opera. Sem isto, o service_id em
-- stop_schedule nao tem significado de calendario.
-- ============================================================

-- calendar.txt — padrao semanal regular de cada servico
CREATE TABLE service_calendar (
    id              BIGSERIAL PRIMARY KEY,
    service_id      VARCHAR(100) NOT NULL,
    monday          BOOLEAN      NOT NULL DEFAULT FALSE,
    tuesday         BOOLEAN      NOT NULL DEFAULT FALSE,
    wednesday       BOOLEAN      NOT NULL DEFAULT FALSE,
    thursday        BOOLEAN      NOT NULL DEFAULT FALSE,
    friday          BOOLEAN      NOT NULL DEFAULT FALSE,
    saturday        BOOLEAN      NOT NULL DEFAULT FALSE,
    sunday          BOOLEAN      NOT NULL DEFAULT FALSE,
    start_date      DATE,
    end_date        DATE,
    gtfs_import_id  BIGINT       REFERENCES gtfs_import(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_calendar_service ON service_calendar(service_id);
CREATE INDEX idx_service_calendar_import  ON service_calendar(gtfs_import_id);

-- calendar_dates.txt — excecoes (feriados, reforcos): adiciona (1) ou
-- remove (2) servico numa data especifica.
CREATE TABLE service_calendar_date (
    id              BIGSERIAL PRIMARY KEY,
    service_id      VARCHAR(100) NOT NULL,
    exception_date  DATE         NOT NULL,
    exception_type  SMALLINT     NOT NULL,   -- 1 = adicionado, 2 = removido
    gtfs_import_id  BIGINT       REFERENCES gtfs_import(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_calendar_date_service ON service_calendar_date(service_id);
CREATE INDEX idx_service_calendar_date_date    ON service_calendar_date(exception_date);
CREATE INDEX idx_service_calendar_date_import  ON service_calendar_date(gtfs_import_id);
