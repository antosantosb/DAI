-- Sprint 5 (3.3): seed do stop_zone (criado vazio na V49).
-- Heuristica: paragens a < 3km do centro de Braga (41.5454, -8.4265)
-- ficam na Coroa 1 (centro alargado); resto na Coroa 2. O admin pode
-- afinar manualmente em /backoffice/stops.
INSERT INTO stop_zone (stop_id, coroa)
SELECT
    bs.id,
    CASE
        WHEN ST_DWithin(
                CAST(bs.location AS geography),
                CAST(ST_SetSRID(ST_MakePoint(-8.4265, 41.5454), 4326) AS geography),
                3000  -- 3 km do centro
             ) THEN 1
        ELSE 2
    END AS coroa
FROM bus_stops bs
WHERE bs.location IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM stop_zone sz WHERE sz.stop_id = bs.id);

-- Adiciona fare_category ao ticket (categorias sociais: SUB23, REFORMADO,
-- SOCIAL, NORMAL). Default NORMAL para os existentes.
ALTER TABLE ticket
    ADD COLUMN IF NOT EXISTS fare_category VARCHAR(16) NOT NULL DEFAULT 'NORMAL';

-- Adiciona fare_category ao fare_config + price para categorias sociais.
ALTER TABLE fare_config
    ADD COLUMN IF NOT EXISTS fare_category VARCHAR(16) NOT NULL DEFAULT 'NORMAL';

-- Drop constraint antigo e recria com fare_category.
ALTER TABLE fare_config DROP CONSTRAINT IF EXISTS uq_fare_config;
ALTER TABLE fare_config
    ADD CONSTRAINT uq_fare_config UNIQUE (ticket_type, coroas, fare_category, valid_from);

-- Seed dos precos sociais 2024.
INSERT INTO fare_config (ticket_type, coroas, fare_category, price_cents, valid_from) VALUES
    ('BORDO', 1, 'SUB23',     50, DATE '2024-01-01'),
    ('BORDO', 2, 'SUB23',    100, DATE '2024-01-01'),
    ('BORDO', 1, 'REFORMADO', 50, DATE '2024-01-01'),
    ('BORDO', 2, 'REFORMADO',100, DATE '2024-01-01'),
    ('PASSE', 1, 'SUB23',    900, DATE '2024-01-01'),
    ('PASSE', 2, 'SUB23',   1800, DATE '2024-01-01'),
    ('PASSE', 1, 'REFORMADO',600, DATE '2024-01-01'),
    ('PASSE', 2, 'REFORMADO',1500, DATE '2024-01-01'),
    ('PASSE', 1, 'SOCIAL',     0, DATE '2024-01-01'),
    ('PASSE', 2, 'SOCIAL',     0, DATE '2024-01-01')
ON CONFLICT (ticket_type, coroas, fare_category, valid_from) DO NOTHING;
