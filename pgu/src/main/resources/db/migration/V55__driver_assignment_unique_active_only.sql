-- A V24 criou em driver_bus_assignments duas constraints UNIQUE problematicas:
--
--   unique_active_driver UNIQUE (driver_id, active)
--   unique_active_bus    UNIQUE (bus_id, active)
--
-- A intencao era "um motorista/bus so' pode ter uma assignment ACTIVA de cada
-- vez". Mas a constraint inclui o caso active=FALSE, o que rebenta o historico:
-- ao desactivar uma 2a assignment para o mesmo motorista/bus, ja existia uma
-- row (driver_id=X, active=FALSE) e o INSERT/UPDATE viola UNIQUE.
--
-- Esta migracao corrige isso: drop das constraints + criacao de indices
-- UNICOS PARCIAIS so' para active = TRUE. Mantem a regra correcta sem partir
-- o historico.
--
-- Idempotente: DROP IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.

ALTER TABLE driver_bus_assignments DROP CONSTRAINT IF EXISTS unique_active_driver;
ALTER TABLE driver_bus_assignments DROP CONSTRAINT IF EXISTS unique_active_bus;

CREATE UNIQUE INDEX IF NOT EXISTS ux_driver_assignment_active_driver
    ON driver_bus_assignments (driver_id)
    WHERE active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_driver_assignment_active_bus
    ON driver_bus_assignments (bus_id)
    WHERE active = TRUE;
