-- ============================================================
-- Sprint 1 (Fase 1): remover o modelo antigo de rota/horario.
-- O GtfsService reescrito popula journey_pattern/pattern_stop/pattern_segment/
-- trip/trip_stop_time; um re-import do GTFS repopula tudo.
-- (Forward-only: em prod corre para a frente; em dev faz-se down -v + re-import.)
-- ============================================================

DROP TABLE IF EXISTS stop_schedule;
DROP TABLE IF EXISTS route_segments;
DROP TABLE IF EXISTS route_stops;
