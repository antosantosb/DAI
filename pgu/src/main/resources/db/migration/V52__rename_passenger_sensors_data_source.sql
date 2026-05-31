-- Fase C (refactor de sensores): renomear a DataSource "Passenger sensors".
--
-- Depois do refactor, o "sensor" deixou de ser uma malha de contadores de
-- passageiros nas portas e passou a ser o MAIN SENSOR (gateway de telematica a
-- bordo, 1 por autocarro). A DataSource monitorizada que a V47 semeou com o
-- nome antigo ("Passenger sensors", descricao "Malha de sensores de contagem
-- de passageiros (gateways/portas)") ja nao reflecte esse modelo.
--
-- A V47 JA FOI APLICADA, por isso o Flyway nao a re-corre: editar a V47 nao
-- mudaria nada nos ambientes existentes. Esta migracao faz o UPDATE in-place do
-- registo ja semeado, mudando o name e a descricao para o novo modelo.
--
-- CRITICO: o "nome" e a CHAVE de lookup do pulse interno
-- (DataSourceHealthService.recordPulseByName). O codigo Java
-- (TelemetryService / SensorIngestService) foi actualizado no mesmo commit para
-- usar exactamente "Main sensors", para o pulse continuar a resolver.
--
-- O "tipo" (APC_SENSOR) MANTEM-SE: e a chave da whitelist self-pulse em
-- DataSourceHealthService (case "APC_SENSOR") e nao precisa de mudar para o
-- novo nome funcionar. Evita-se assim tocar nessa logica.
--
-- Idempotente: o UPDATE filtra pelo nome antigo; re-corridas (ou ambientes onde
-- ja exista o nome novo) sao no-op. Tambem cobre o caso de a V47 ainda nao ter
-- semeado nada (UPDATE de 0 linhas, sem falhar).

UPDATE data_source
   SET nome      = 'Main sensors',
       descricao = 'Gateways de telematica a bordo (1 por autocarro)'
 WHERE nome = 'Passenger sensors';
