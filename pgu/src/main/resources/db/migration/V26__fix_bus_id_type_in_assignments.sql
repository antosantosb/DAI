-- Corrige o tipo da coluna bus_id que ficou VARCHAR em vez de BIGINT
ALTER TABLE driver_bus_assignments
    ALTER COLUMN bus_id TYPE BIGINT USING bus_id::BIGINT;
