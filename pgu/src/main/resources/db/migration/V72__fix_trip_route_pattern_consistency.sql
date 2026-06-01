-- ============================================================
-- V72: Corrigir e impedir inconsistência trip.route_id vs pattern.route_id
-- ============================================================
--
-- Problema observado: existiam trips cujo `route_id` apontava para uma rota
-- diferente da rota dona do seu `pattern_id` (ex.: trip headsign
-- "SENHORA-A-BRANCA" com route_id da linha LT mas pattern_id apontando a um
-- pattern da linha 2 "PONTE DE PRADO - BOM JESUS"). Isto fazia com que o
-- Livemap, ao destacar o pattern do bus, desenhasse a linha errada — embora
-- o painel de detalhe mostrasse a rota "correcta" (vinda de trip.route).
--
-- A relação correcta (modelo Transmodel) é: o JourneyPattern PERTENCE a uma
-- Route, e cada Trip executa um JourneyPattern. Portanto a rota da trip
-- deveria ser SEMPRE derivada do pattern, não armazenada à parte. Como
-- compatibilidade legacy mantemos trip.route_id, mas obrigamos a invariante.
--
-- Esta migration:
--   1) Repara trips existentes com inconsistência (alinha ao pattern).
--   2) Cria função + trigger que valida a invariante em INSERT/UPDATE.
-- ============================================================

-- 1) Reparar trips existentes
UPDATE trip t
SET    route_id = jp.route_id
FROM   journey_pattern jp
WHERE  jp.id = t.pattern_id
  AND  t.route_id IS DISTINCT FROM jp.route_id;

-- 2) Garantir a invariante para o futuro
CREATE OR REPLACE FUNCTION trip_route_matches_pattern() RETURNS trigger AS $$
DECLARE
    pat_route_id BIGINT;
BEGIN
    IF NEW.pattern_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT route_id INTO pat_route_id FROM journey_pattern WHERE id = NEW.pattern_id;
    IF pat_route_id IS NULL THEN
        RAISE EXCEPTION 'JourneyPattern % nao existe.', NEW.pattern_id;
    END IF;

    -- Se route_id veio NULL, herda do pattern. Se veio diferente, força-se ao do pattern
    -- (escolha conservadora: pattern e' a fonte da verdade da estrutura).
    IF NEW.route_id IS NULL OR NEW.route_id IS DISTINCT FROM pat_route_id THEN
        NEW.route_id := pat_route_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_route_matches_pattern ON trip;
CREATE TRIGGER trg_trip_route_matches_pattern
    BEFORE INSERT OR UPDATE OF route_id, pattern_id ON trip
    FOR EACH ROW
    EXECUTE FUNCTION trip_route_matches_pattern();
