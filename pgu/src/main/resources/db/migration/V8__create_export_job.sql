-- Motor de Exportação Massiva: tabela de jobs de exportação
CREATE TABLE IF NOT EXISTS export_job (
    id              BIGSERIAL PRIMARY KEY,
    job_uuid        UUID NOT NULL UNIQUE,
    requested_by    VARCHAR(128),
    format          VARCHAR(8)   NOT NULL,            -- CSV | PDF
    status          VARCHAR(16)  NOT NULL,            -- PENDING | PROCESSING | COMPLETED | FAILED
    bus_id_filter   VARCHAR(64),
    from_ts         TIMESTAMPTZ,
    to_ts           TIMESTAMPTZ,
    file_path       TEXT,
    file_name       VARCHAR(255),
    row_count       BIGINT,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_export_job_status   ON export_job(status);
CREATE INDEX idx_export_job_requester ON export_job(requested_by, created_at DESC);
