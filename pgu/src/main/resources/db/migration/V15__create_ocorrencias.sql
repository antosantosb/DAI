CREATE TABLE ocorrencias (
    id                  BIGSERIAL PRIMARY KEY,
    ativo_id            VARCHAR(50)  NOT NULL,          -- bus_id ou charger_id
    tipo_ativo          VARCHAR(20)  NOT NULL DEFAULT 'BUS', -- BUS | CHARGER
    tipo_anomalia       VARCHAR(100) NOT NULL,           -- SOBREAQUECIMENTO, FALHA_CARREGADOR, BATERIA_CRITICA, …
    descricao           TEXT,
    prioridade          VARCHAR(20)  NOT NULL DEFAULT 'NORMAL', -- CRITICA | NORMAL
    estado              VARCHAR(30)  NOT NULL DEFAULT 'ABERTA',  -- ABERTA | EM_CURSO | RESOLVIDA | FALSO_POSITIVO
    timestamp_abertura  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    timestamp_assumida  TIMESTAMPTZ,
    timestamp_fecho     TIMESTAMPTZ,
    responsavel         VARCHAR(100),                   -- username de quem assumiu
    notas_iniciais      TEXT,
    acao_corretiva      TEXT,
    falso_positivo_justificacao TEXT,
    ocorrencia_pai_id   BIGINT REFERENCES ocorrencias(id), -- para reincidências
    reincidencia        BOOLEAN      NOT NULL DEFAULT FALSE,
    telemetria_snapshot JSONB,                          -- snapshot dos dados de telemetria no momento do alarme
    criado_por          VARCHAR(100),                   -- sistema ou username do operador
    CONSTRAINT chk_estado CHECK (estado IN ('ABERTA','EM_CURSO','RESOLVIDA','FALSO_POSITIVO'))
);

-- Índices de performance
CREATE INDEX idx_ocorrencias_ativo     ON ocorrencias(ativo_id);
CREATE INDEX idx_ocorrencias_estado    ON ocorrencias(estado);
CREATE INDEX idx_ocorrencias_abertura  ON ocorrencias(timestamp_abertura DESC);

-- Tabela para anexos das ocorrências
CREATE TABLE ocorrencia_anexos (
    id              BIGSERIAL PRIMARY KEY,
    ocorrencia_id   BIGINT NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
    nome_ficheiro   VARCHAR(255) NOT NULL,
    tamanho_bytes   BIGINT NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    caminho         VARCHAR(500) NOT NULL,
    upload_por      VARCHAR(100),
    upload_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ocorrencia_anexos_ocorrencia ON ocorrencia_anexos(ocorrencia_id);

