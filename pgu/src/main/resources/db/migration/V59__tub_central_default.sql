-- V59: corrigir o default da Central TUB para as coordenadas exactas da
-- garagem (41.539908, -8.435542). A V53 tinha posto valores aproximados do
-- centro de Braga (41.5454, -8.4265), que ficam ~1.2 km a NE da garagem real.
--
-- Estrategia: so' actualiza linhas que ainda estao com o default antigo, para
-- nao sobrescrever uma central configurada manualmente pelo admin atraves do
-- picker em Parametros > Central TUB.

UPDATE global_config
   SET tub_central_lat = 41.539908,
       tub_central_lon = -8.435542
 WHERE tub_central_lat = 41.5454
   AND tub_central_lon = -8.4265;

-- Caso a tabela esteja vazia (instalacao limpa pos-V59), insere a linha com
-- o ponto correcto. NOT EXISTS evita duplicados em re-migracoes.
INSERT INTO global_config (tub_central_lat, tub_central_lon)
SELECT 41.539908, -8.435542
 WHERE NOT EXISTS (SELECT 1 FROM global_config);
