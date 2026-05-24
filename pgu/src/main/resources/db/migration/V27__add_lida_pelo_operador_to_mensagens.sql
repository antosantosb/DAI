-- Adiciona estado de "lida pelo operador" para suportar badge de não-lidas no backoffice.
-- Mensagens existentes são consideradas lidas (histórico) para não criar ruído ao deployar.
ALTER TABLE mensagens_despacho
    ADD COLUMN lida_pelo_operador BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE mensagens_despacho SET lida_pelo_operador = TRUE;

-- Índice para a query de contagem de não-lidas por autocarro
CREATE INDEX idx_mensagens_unread ON mensagens_despacho(bus_id, lida_pelo_operador)
    WHERE lida_pelo_operador = FALSE;
