CREATE TABLE ai_interaction_log (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             VARCHAR(64) NOT NULL,           -- JWT 'sub'
    username            VARCHAR(255),                    -- denormalized para queries fáceis
    session_id          UUID NOT NULL,                   -- agrupa turnos da mesma conversa (client-side)
    prompt              TEXT NOT NULL,
    prompt_length       INT NOT NULL,
    prompt_hash         VARCHAR(64) NOT NULL,            -- SHA-256 para análise de prompts repetidos
    tools_called        TEXT[],                          -- ['getFleetOccupancyByHour', ...]
    tools_call_count    INT NOT NULL DEFAULT 0,
    response_summary    TEXT,                            -- primeiros 500 chars da resposta
    response_length     INT,
    latency_ms          INT NOT NULL,
    model_name          VARCHAR(64) NOT NULL,            -- ex: 'gemma4:4b'
    status              VARCHAR(16) NOT NULL,            -- SUCCESS, ERROR, REJECTED, TIMEOUT
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_status CHECK (status IN ('SUCCESS', 'ERROR', 'REJECTED', 'TIMEOUT', 'PENDING'))
);

CREATE INDEX idx_ai_log_user_time   ON ai_interaction_log(user_id, created_at DESC);
CREATE INDEX idx_ai_log_status      ON ai_interaction_log(status, created_at DESC);
CREATE INDEX idx_ai_log_session     ON ai_interaction_log(session_id);
CREATE INDEX idx_ai_log_prompt_hash ON ai_interaction_log(prompt_hash);

-- Comentários para documentação
COMMENT ON TABLE ai_interaction_log IS 'Audit log de todas interações com o agente IA. Retenção 2 anos, depois anonimização.';
COMMENT ON COLUMN ai_interaction_log.prompt_hash IS 'SHA-256 do prompt para análise de duplicados sem expor conteúdo.';
COMMENT ON COLUMN ai_interaction_log.tools_called IS 'Array com nomes das tools invocadas neste turno (zero, uma ou várias).';
