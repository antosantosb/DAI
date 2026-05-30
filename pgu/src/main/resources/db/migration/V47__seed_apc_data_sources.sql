-- Sprint 2 (Vertical 3.4, R.ICP.07/R.ICP.01): observabilidade das fontes APC.
--
-- Regista como DataSource monitorizada (a imitar V44) os dois novos fluxos do
-- sistema de contagem de passageiros:
--   * Passenger sensors : a malha de sensores APC (gateways/portas). Pulsa
--     internamente sempre que ha uma leitura de ocupacao
--     (DataSourceHealthService.recordPulseByName).
--   * Telemetry ingest  : o pipeline de ingestao de telemetria (NiFi ->
--     POST /api/v1/telemetry/ingest). Pulsa a cada telemetria persistida.
--
-- Estas fontes sao self-pulse (a frescura vem dos pulses internos, nao de um
-- probe externo, tal como SIMULATOR/GTFS_RT/NETEX). Thresholds generosos
-- porque a cadencia depende de haver autocarros activos a reportar.
--
-- Idempotente: ON CONFLICT (nome) garante re-corridas sem falhar nem duplicar.

INSERT INTO data_source (nome, tipo, descricao, owner, contacto_email, status, pulse_interval_seconds, degraded_threshold_seconds, down_threshold_seconds)
VALUES
  ('Passenger sensors', 'APC_SENSOR',  'Malha de sensores de contagem de passageiros (gateways/portas)',      'Equipa DAI', 'dai@uminho.pt', 'UNKNOWN', 60,  600,  1800),
  ('Telemetry ingest',  'TELEMETRY',   'Pipeline de ingestao de telemetria (NiFi -> POST /telemetry/ingest)', 'Equipa DAI', 'dai@uminho.pt', 'UNKNOWN', 30,  300,  900)
ON CONFLICT (nome) DO NOTHING;
