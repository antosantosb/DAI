-- ============================================================
-- Fase E (passo E-back-1): estado do autocarro + escala (duty).
--
-- Objectivo:
--   1) Alargar buses.status para acomodar os 4 estados (STOPPED,
--      EM_SERVICO, STOPPING, DECOMMISSIONED) e normalizar o default.
--   2) Criar bus_duty: lista ordenada de trips planeadas para um
--      autocarro num determinado dia (a "escala"). Um bus_duty
--      corresponde a UMA trip; varias linhas (com sequence crescente)
--      formam a escala do bus para o servico_date.
--   3) Acrescentar ao global_config o ponto da CENTRAL TUB
--      (latitude/longitude) usado para deadhead (STOPPING -> central).
--
-- Idempotente onde faz sentido (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ============================================================
-- 1) Alargar buses.status (4 estados) e normalizar o default.
-- ============================================================
-- O ALTER COLUMN TYPE so corre se o tipo actual for menor que 32.
ALTER TABLE buses
    ALTER COLUMN status TYPE VARCHAR(32);

-- Default 'STOPPED' (substitui o legacy 'ACTIVE'). Linhas existentes
-- com status legacy 'ACTIVE' ficam parqueadas como 'STOPPED' (na pratica
-- nenhum bus esta em servico ate o motorista iniciar a escala).
ALTER TABLE buses
    ALTER COLUMN status SET DEFAULT 'STOPPED';

UPDATE buses
SET status = 'STOPPED'
WHERE status IS NULL OR status NOT IN ('STOPPED', 'EM_SERVICO', 'STOPPING', 'DECOMMISSIONED');

-- ============================================================
-- 2) Tabela bus_duty.
-- ============================================================
CREATE TABLE IF NOT EXISTS bus_duty (
    id              BIGSERIAL    PRIMARY KEY,
    bus_id          BIGINT       NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    trip_id         BIGINT       NOT NULL REFERENCES trip(id),
    service_date    DATE         NOT NULL,
    sequence        INTEGER      NOT NULL,
    planned_start   TIMESTAMPTZ  NOT NULL,
    status          VARCHAR(32)  NOT NULL DEFAULT 'PLANNED',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bus_duty_bus_date_seq UNIQUE (bus_id, service_date, sequence),
    CONSTRAINT uq_bus_duty_trip_date    UNIQUE (trip_id, service_date)
);

CREATE INDEX IF NOT EXISTS idx_bus_duty_bus_date
    ON bus_duty (bus_id, service_date);

CREATE INDEX IF NOT EXISTS idx_bus_duty_planned_start
    ON bus_duty (planned_start);

-- ============================================================
-- 3) Central TUB (latitude/longitude) em global_config.
-- ============================================================
-- O global_config e' uma linha unica com colunas "wide" (ver V17/V33/V48).
-- Acrescenta tub_central_lat/lon como DOUBLE PRECISION. Default aproximado
-- de Braga (Sede da TUB junto a Av. da Liberdade).
ALTER TABLE global_config
    ADD COLUMN IF NOT EXISTS tub_central_lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS tub_central_lon DOUBLE PRECISION;

UPDATE global_config
SET tub_central_lat = COALESCE(tub_central_lat, 41.5454),
    tub_central_lon = COALESCE(tub_central_lon, -8.4265);

-- Se a tabela esta vazia (migracao inicial), inserir uma linha com defaults.
INSERT INTO global_config (tub_central_lat, tub_central_lon)
SELECT 41.5454, -8.4265
WHERE NOT EXISTS (SELECT 1 FROM global_config);
