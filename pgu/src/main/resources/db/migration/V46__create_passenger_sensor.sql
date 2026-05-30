-- Sprint 2 (Vertical 3.4, R.ICP.07): inventario de sensores de contagem.
--
-- Cada sensor APC e' um dispositivo fisico instalado numa porta de um
-- autocarro, ligado por um gateway. Guardamos o estado, a ultima leitura e a
-- localizacao (geometria Point, 4326, coerente com bus_stops/vehicle_telemetry,
-- tipicamente a posicao da garagem/oficina ou da ultima leitura conhecida).
--
-- A FK para buses e' opcional (ON DELETE SET NULL): um sensor pode estar em
-- stock/manutencao sem autocarro atribuido. door_position descreve a porta
-- (ex.: FRONT, MIDDLE, REAR).

CREATE TABLE passenger_sensor (
    id            BIGSERIAL    PRIMARY KEY,
    gateway       VARCHAR(64)  NOT NULL,
    bus_id        BIGINT       REFERENCES buses(id) ON DELETE SET NULL,
    door_position VARCHAR(16)  NOT NULL DEFAULT 'FRONT',
    status        VARCHAR(16)  NOT NULL DEFAULT 'UNKNOWN',   -- ACTIVE, INACTIVE, FAULT, UNKNOWN
    last_reading  TIMESTAMPTZ,
    location      geometry(Point, 4326),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_passenger_sensor_bus      ON passenger_sensor(bus_id);
CREATE INDEX idx_passenger_sensor_status   ON passenger_sensor(status);
CREATE INDEX idx_passenger_sensor_location ON passenger_sensor USING GIST (location);
