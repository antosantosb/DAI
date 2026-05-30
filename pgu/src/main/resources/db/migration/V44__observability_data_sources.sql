-- Sprint 1 (F9): observabilidade dos publicadores Open Data (R.ID.01-09).
--
-- Regista como DataSource monitorizada os dois publicadores adicionados nas
-- fases F7 e F8:
--   * GTFS-RT publisher: feeds GTFS-Realtime (vehicle-positions / trip-updates).
--   * NeTEx exporter: documento NeTEx PublicationDelivery da rede.
--
-- Ao contrario do simulador/NiFi (que pulsam em intervalos fixos), estes
-- publicadores so' geram um pulse quando alguem pede o feed/export. Por isso
-- os thresholds sao generosos: nao queremos marcar a fonte como DEGRADED/DOWN
-- apenas porque ninguem consumiu o endpoint durante algum tempo. O pulse e'
-- registado internamente pelo backend (DataSourceHealthService.recordPulseByName)
-- a cada geracao bem sucedida, resolvido pelo nome unico abaixo.
--
-- Idempotente: ON CONFLICT (nome) garante que re-correr a migracao (ou um
-- ambiente onde o nome ja' exista) nao falha nem duplica.

INSERT INTO data_source (nome, tipo, descricao, owner, contacto_email, status, pulse_interval_seconds, degraded_threshold_seconds, down_threshold_seconds)
VALUES
  ('GTFS-RT publisher', 'GTFS_RT', 'Publicador de feeds GTFS-Realtime (vehicle-positions e trip-updates)', 'Equipa DAI', 'dai@uminho.pt', 'UNKNOWN', 3600, 7200, 86400),
  ('NeTEx exporter',    'NETEX',   'Exportador do documento NeTEx PublicationDelivery da rede',           'Equipa DAI', 'dai@uminho.pt', 'UNKNOWN', 86400, 172800, 259200)
ON CONFLICT (nome) DO NOTHING;
