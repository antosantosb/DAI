-- ============================================================
-- Sprint 1 (Fase 2): persistir a sequencia de autoria de um padrao manual.
-- Guarda a lista ordenada de pontos (STOP/WAYPOINT, com type/stopId/lat/lon)
-- tal como foi desenhada no mapa, para que o padrao possa ser reaberto e
-- editado mantendo as ancoras (waypoints). Coluna anulavel: os padroes
-- importados de GTFS ficam a null e usam fallback (paragens em sequencia).
-- ============================================================

ALTER TABLE journey_pattern ADD COLUMN authoring_points TEXT;
