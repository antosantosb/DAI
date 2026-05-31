-- Fase B (refactor de sensores): passenger_sensor -> vehicle_sensor.
--
-- O conceito muda: o sensor deixa de ser apenas um contador de passageiros numa
-- porta e passa a representar o MAIN SENSOR (gateway de telematica a bordo), um
-- por autocarro. Esse main sensor agrega varios sub-sensores (rpm, bateria, km,
-- passageiros, gps), cada um com valor e saude (0..1). Ha uma linha de inventario
-- por main sensor. Pode estar "livre" (sem autocarro, bus_id null) ou atribuido a
-- um autocarro existente.
--
-- Esta migracao NAO apaga dados: renomeia a tabela e os objectos associados
-- (indices/sequencia/constraints) que tinham "passenger_sensor" no nome, para
-- manter coerencia, e acrescenta as colunas novas se ainda nao existirem.
--
-- Idempotente sempre que o Postgres permite (IF EXISTS / IF NOT EXISTS).

-- 1) Renomear a tabela (preserva dados, indices e a FK existente).
ALTER TABLE IF EXISTS passenger_sensor RENAME TO vehicle_sensor;

-- 2) Renomear a sequencia do BIGSERIAL (id) para coerencia de nomes.
--    O BIGSERIAL de passenger_sensor.id criou passenger_sensor_id_seq.
ALTER SEQUENCE IF EXISTS passenger_sensor_id_seq RENAME TO vehicle_sensor_id_seq;

-- 3) Renomear os indices criados na V46 (RENAME e' no-op caso ja nao existam
--    com este nome; envolvido em DO para tolerar ausencia sem falhar).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_passenger_sensor_bus') THEN
        ALTER INDEX idx_passenger_sensor_bus RENAME TO idx_vehicle_sensor_bus;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_passenger_sensor_status') THEN
        ALTER INDEX idx_passenger_sensor_status RENAME TO idx_vehicle_sensor_status;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_passenger_sensor_location') THEN
        ALTER INDEX idx_passenger_sensor_location RENAME TO idx_vehicle_sensor_location;
    END IF;
END $$;

-- 4) Colunas novas do modelo de main sensor (idempotentes).
--    bus_id ja existe desde a V46 (FK para buses ON DELETE SET NULL); mantem-se.
--    status ja existe (VARCHAR(16) DEFAULT 'UNKNOWN'); alargamos para 32 e
--    actualizamos o default para 'ATIVO' conforme o novo modelo.
ALTER TABLE vehicle_sensor ALTER COLUMN status TYPE VARCHAR(32);
ALTER TABLE vehicle_sensor ALTER COLUMN status SET DEFAULT 'ATIVO';

-- subsensor_health: snapshot JSON dos sub-sensores (valor + saude 0..1).
ALTER TABLE vehicle_sensor ADD COLUMN IF NOT EXISTS subsensor_health JSONB;

-- last_reading_at: instante da ultima leitura agregada do main sensor.
ALTER TABLE vehicle_sensor ADD COLUMN IF NOT EXISTS last_reading_at TIMESTAMPTZ;

-- Garante bus_id presente mesmo que algum ambiente antigo nao o tivesse.
ALTER TABLE vehicle_sensor ADD COLUMN IF NOT EXISTS bus_id BIGINT;

-- Indice para procurar sensores livres (bus_id IS NULL) e por autocarro.
-- O indice de bus_id ja foi renomeado no passo 3; recriamos so' se faltar.
CREATE INDEX IF NOT EXISTS idx_vehicle_sensor_bus ON vehicle_sensor(bus_id);
