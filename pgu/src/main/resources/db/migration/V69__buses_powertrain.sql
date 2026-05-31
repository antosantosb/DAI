-- Sprint 4 (3.2): Material Circulante — extensao tri-powertrain.
-- A TUB opera uma frota mista: gasoleo (DIESEL, maioria envelhecida),
-- electrico (ELECTRIC, em crescimento) e gas natural (CNG). Cada
-- powertrain tem atributos especificos: depositos para combustao, bateria
-- para electricos, tanque pressurizado para CNG.
ALTER TABLE buses
    ADD COLUMN IF NOT EXISTS powertrain VARCHAR(16) NOT NULL DEFAULT 'DIESEL'
        CHECK (powertrain IN ('DIESEL','ELECTRIC','CNG')),
    -- DIESEL / CNG (motores de combustao)
    ADD COLUMN IF NOT EXISTS fuel_tank_l       NUMERIC(6,1) NULL,  -- capacidade deposito gasoleo (L)
    ADD COLUMN IF NOT EXISTS adblue_tank_l     NUMERIC(6,1) NULL,  -- SCR/NOx, so DIESEL Euro 6
    -- ELECTRIC
    ADD COLUMN IF NOT EXISTS battery_kwh       NUMERIC(6,1) NULL,  -- capacidade nominal (kWh)
    ADD COLUMN IF NOT EXISTS charging_type     VARCHAR(16)  NULL,  -- SLOW | FAST | OPPORTUNITY
    -- CNG
    ADD COLUMN IF NOT EXISTS cng_tank_kg       NUMERIC(6,1) NULL,  -- capacidade tanque (kg)
    ADD COLUMN IF NOT EXISTS cng_nominal_bar   NUMERIC(5,1) NULL;  -- pressao nominal

CREATE INDEX IF NOT EXISTS idx_buses_powertrain ON buses(powertrain);

COMMENT ON COLUMN buses.powertrain IS 'DIESEL | ELECTRIC | CNG. Determina campos relevantes em vehicle_diagnostic.';
