-- ==========================================
-- Sprint -1 (Fase 3/9): Indices de performance — BE-15, BE-16
-- ==========================================
-- A) vehicle_telemetry (BE-15)
--    Queries hot:
--      - latest per bus: "WHERE bus_id = ? ORDER BY recorded_at DESC LIMIT 1"
--      - range por bus:  "WHERE bus_id = ? AND recorded_at BETWEEN ? AND ?"
--    Sem indice: full scan (17M+ rows/dia ao ritmo do simulador).
--    Indice composto (bus_id, recorded_at DESC) torna estas queries O(log n).
CREATE INDEX IF NOT EXISTS idx_telemetry_bus_recorded
    ON vehicle_telemetry (bus_id, recorded_at DESC);

-- B) ocorrencias (BE-16)
--    Queries hot:
--      - alarmes ativos:    "WHERE estado = 'ABERTA' ORDER BY timestamp_abertura DESC"
--      - drill-down ativo:  "WHERE ativo_id = ? AND estado IN ('ABERTA','ASSUMIDA')"
--    Sem indice: full scan + sort em memoria.
CREATE INDEX IF NOT EXISTS idx_ocorrencias_estado_abertura
    ON ocorrencias (estado, timestamp_abertura DESC);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_ativo_estado
    ON ocorrencias (ativo_id, estado);

-- C) mensagens_despacho — extra (vai beneficiar GET /despacho/{busId}/mensagens)
--    Ja existe `idx_mensagens_unread` da V27 mas so para nao-lidas.
--    Adicionar geral por bus_id + timestamp ajuda o listing principal.
CREATE INDEX IF NOT EXISTS idx_mensagens_bus_timestamp
    ON mensagens_despacho (bus_id, timestamp_envio DESC);
