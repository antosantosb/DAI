CREATE TABLE mensagens_despacho (
    id                  BIGSERIAL PRIMARY KEY,
    bus_id              VARCHAR(50)  NOT NULL,
    conteudo            VARCHAR(140) NOT NULL,            -- limite de 140 chars (requisito)
    estado              VARCHAR(30)  NOT NULL DEFAULT 'ENVIADA', -- ENVIADA | ENTREGUE | LIDA | FALHOU | CANCELADA
    operador            VARCHAR(100) NOT NULL,            -- username do operador (do JWT)
    timestamp_envio     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    timestamp_entrega   TIMESTAMPTZ,                     -- quando a CM confirmou receção
    timestamp_leitura   TIMESTAMPTZ,                     -- quando o motorista marcou como lida
    erro_detalhe        TEXT,                            -- detalhe do erro se estado = FALHOU
    mqtt_message_id     VARCHAR(100),                    -- ID da mensagem MQTT para correlação
    CONSTRAINT chk_estado_msg CHECK (estado IN ('ENVIADA','ENTREGUE','LIDA','FALHOU','CANCELADA')),
    CONSTRAINT chk_conteudo_len CHECK (LENGTH(conteudo) > 0 AND LENGTH(conteudo) <= 140)
);

CREATE INDEX idx_mensagens_bus_id    ON mensagens_despacho(bus_id);
CREATE INDEX idx_mensagens_estado    ON mensagens_despacho(estado);
CREATE INDEX idx_mensagens_operador  ON mensagens_despacho(operador);
CREATE INDEX idx_mensagens_timestamp ON mensagens_despacho(timestamp_envio DESC);
