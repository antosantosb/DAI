-- Clarifica descricoes dos data sources que se sobrepunham na UI ("Telemetry
-- ingest" vs "Main sensors") para o utilizador perceber a diferenca de relance:
--   * "Telemetry ingest" = saude do CANAL (NiFi -> backend), pulsa por frame recebido.
--   * "Main sensors"     = saude do EQUIPAMENTO (gateway de telematica a bordo).
--
-- Apenas UPDATE textual (nome/descricao); thresholds e tipos inalterados.
-- Idempotente: WHERE filtra pelo nome canonico; re-correr e' no-op.

UPDATE data_source
   SET descricao = 'Saúde do canal de ingestão (NiFi → backend). Pulsa em cada frame recebido.'
 WHERE nome = 'Telemetry ingest';

UPDATE data_source
   SET descricao = 'Saúde dos gateways de telemática a bordo (1 por autocarro).'
 WHERE nome = 'Main sensors';
