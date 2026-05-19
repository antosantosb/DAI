-- Adiciona campo data_type ao export_job para distinguir exportações de telemetria vs audit logs
ALTER TABLE export_job ADD COLUMN IF NOT EXISTS data_type VARCHAR(16) DEFAULT 'TELEMETRY';
UPDATE export_job SET data_type = 'TELEMETRY' WHERE data_type IS NULL;
