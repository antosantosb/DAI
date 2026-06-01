-- ============================================================
-- V73: Sincronizar bus.route_id com a duty activa
-- ============================================================
--
-- Problema: bus.route_id era escrito ao criar/iniciar uma duty mas nunca
-- limpo quando o bus voltava a STOPPED nem actualizado quando a duty mudava.
-- Resultado: buses STOPPED com route "stuck" da ultima escala, e buses em
-- servico a mostrar a rota da PRIMEIRA duty do dia em vez da que estao mesmo
-- a executar.
--
-- A V72 ja garantiu que trip.route_id == trip.pattern.route_id. Esta migration
-- aproveita essa invariante para normalizar bus.route_id de uma vez:
--
--   - STOPPED -> route_id := NULL
--   - Caso contrario -> route_id := route da duty RUNNING actual (se existir)
--
-- O codigo aplicacional (BusService.arrived limpa, BusDutyService promove
-- duty -> sync route) trata de manter a invariante a partir daqui.
-- ============================================================

-- 1) Buses STOPPED: limpa route_id
UPDATE buses
SET    route_id = NULL
WHERE  status = 'STOPPED'
  AND  route_id IS NOT NULL;

-- 2) Buses em servico (STARTING/EM_SERVICO/STOPPING): alinhar com duty RUNNING
UPDATE buses b
SET    route_id = t.route_id
FROM   bus_duty d
JOIN   trip t ON t.id = d.trip_id
WHERE  d.bus_id = b.id
  AND  d.status = 'RUNNING'
  AND  b.status IN ('STARTING', 'EM_SERVICO', 'STOPPING')
  AND  (b.route_id IS DISTINCT FROM t.route_id);
