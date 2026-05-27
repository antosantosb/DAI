-- Sprint 0 (F9): migracao dos exports CSV/PDF para MinIO.
--
-- Antes: ExportService gravava em /var/pgu/exports (volume Docker) e usava
-- file_path para servir o download via /api/v1/exports/{uuid}/download.
--
-- Agora: os objetos vivem no bucket MinIO `exports` com key = <jobUuid>.<ext>.
-- O backend devolve presigned URLs (TTL 60 min) que o browser usa diretamente
-- contra o MinIO publico, libertando o backend de servir bytes.
--
-- Mudancas:
--   - Nova coluna object_key (chave do objeto no MinIO, ex: "a1b2c3-...-csv")
--   - Nova coluna file_size (bytes, util para UI e auditoria)
--   - file_path passa a ser opcional (mantido para jobs legacy ate purga)

ALTER TABLE export_job
    ADD COLUMN IF NOT EXISTS object_key VARCHAR(255),
    ADD COLUMN IF NOT EXISTS file_size  BIGINT;

ALTER TABLE export_job
    ALTER COLUMN file_path DROP NOT NULL;

-- Indice para queries de cleanup/lookup por key (raramente usado, mas barato).
CREATE INDEX IF NOT EXISTS idx_export_job_object_key
    ON export_job (object_key);
