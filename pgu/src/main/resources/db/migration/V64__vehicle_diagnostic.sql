-- Sprint 4 (3.2): vehicle_diagnostic — telemetria OBD/CAN (FMS / J1939).
-- Particionada por mes (PK composta (id, recorded_at)). Campos condicionais
-- ao powertrain do bus: motor de combustao (rpm, coolant), DIESEL (fuel,
-- AdBlue, DPF), CNG (gas), ELECTRIC (SoC/SoH/regen). Dtc_codes formato
-- DM1 (SPN/FMI) seguindo J1939.
CREATE TABLE IF NOT EXISTS vehicle_diagnostic (
    id              BIGSERIAL,
    bus_id          VARCHAR(32)  NOT NULL,
    recorded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    powertrain      VARCHAR(16)  NOT NULL,                 -- snapshot do tipo (auditoria)

    -- Sinais Bus-FMS / J1939 genericos
    odometer_km     NUMERIC(10,1) NULL,
    service_hours   NUMERIC(8,1)  NULL,
    door_open_count INT           NULL,
    ambient_temp_c  NUMERIC(4,1)  NULL,
    speed_kmh       NUMERIC(5,1)  NULL,

    -- Motor de combustao (DIESEL + CNG)
    engine_rpm      INT           NULL,
    coolant_temp_c  NUMERIC(4,1)  NULL,
    oil_pressure_bar NUMERIC(4,1) NULL,

    -- DIESEL especifico
    fuel_level_pct  SMALLINT      NULL,
    adblue_level_pct SMALLINT     NULL,
    dpf_soot_pct    SMALLINT      NULL,    -- saude do filtro de particulas

    -- CNG especifico
    cng_pressure_bar NUMERIC(5,1) NULL,
    cng_level_pct   SMALLINT      NULL,

    -- ELECTRIC especifico
    soc_pct         SMALLINT      NULL,    -- state of charge
    soh_pct         SMALLINT      NULL,    -- state of health
    regen_kw        NUMERIC(5,1)  NULL,    -- potencia regen actual
    motor_kw        NUMERIC(5,1)  NULL,

    -- DTCs (codigos de falha J1939 DM1, formato "SPN<n>/FMI<n>")
    dtc_codes       TEXT          NULL,    -- separados por virgula

    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

DO $$
DECLARE
    cur_month DATE := date_trunc('month', NOW())::date;
    nxt_month DATE := (date_trunc('month', NOW()) + INTERVAL '1 month')::date;
    aft_month DATE := (date_trunc('month', NOW()) + INTERVAL '2 months')::date;
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS vehicle_diagnostic_%s PARTITION OF vehicle_diagnostic FOR VALUES FROM (%L) TO (%L)',
        to_char(cur_month, 'YYYY_MM'), cur_month::timestamptz, nxt_month::timestamptz);
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS vehicle_diagnostic_%s PARTITION OF vehicle_diagnostic FOR VALUES FROM (%L) TO (%L)',
        to_char(nxt_month, 'YYYY_MM'), nxt_month::timestamptz, aft_month::timestamptz);
END $$;

CREATE INDEX IF NOT EXISTS idx_diag_bus_ts ON vehicle_diagnostic(bus_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_diag_pwt_ts ON vehicle_diagnostic(powertrain, recorded_at DESC);

COMMENT ON TABLE vehicle_diagnostic IS 'Sprint 4: telemetria OBD/CAN (FMS/J1939) particionada por mes.';
