-- Fix do modelo de sensores: um autocarro tem NO MAXIMO 1 main sensor.
--
-- O simulador estava a criar/atribuir sensores automaticamente, o que gerou
-- duplicados (um autocarro chegou a ficar com 2 sensores atribuidos). Esta
-- migracao corrige os dados existentes e impede que volte a acontecer:
--
--   1) Resolve duplicados: para cada bus_id com mais do que 1 sensor atribuido,
--      mantem o sensor de MENOR id e liberta os restantes (bus_id = NULL).
--      NAO apaga nenhum sensor; apenas os desatribui (continuam no inventario).
--   2) Cria um indice UNIQUE parcial em vehicle_sensor(bus_id) restrito a
--      bus_id IS NOT NULL, garantindo no maximo 1 sensor por autocarro e
--      mantendo varios sensores livres (bus_id NULL) em simultaneo.
--   3) Cria um indice UNIQUE em vehicle_sensor(gateway): o gateway identifica
--      univocamente o main sensor e o backend resolve o autocarro por ele
--      (findByGateway), por isso nao pode haver dois sensores com o mesmo.
--
-- Idempotente: o UPDATE so' afecta duplicados (nada a fazer se ja' houver 1 por
-- autocarro) e o indice usa IF NOT EXISTS.

-- 1) Libertar duplicados, mantendo o sensor de menor id por autocarro.
UPDATE vehicle_sensor vs
SET    bus_id = NULL
WHERE  vs.bus_id IS NOT NULL
  AND  vs.id <> (
        SELECT MIN(keep.id)
        FROM   vehicle_sensor keep
        WHERE  keep.bus_id = vs.bus_id
  );

-- 2) Forcar 1 sensor por autocarro (sensores livres com bus_id NULL ficam de fora).
CREATE UNIQUE INDEX IF NOT EXISTS ux_vehicle_sensor_bus
    ON vehicle_sensor(bus_id)
    WHERE bus_id IS NOT NULL;

-- 3) Gateway unico: o backend resolve o sensor -> autocarro por findByGateway,
--    logo nao podem existir dois sensores com o mesmo gateway. Os gateways sao
--    IDs de aparelho (distintos por natureza), por isso nao ha duplicados a tratar.
CREATE UNIQUE INDEX IF NOT EXISTS ux_vehicle_sensor_gateway
    ON vehicle_sensor(gateway);
