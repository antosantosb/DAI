-- Sprint 0 (F2): tabela de audit log de chamadas HTTP.
--
-- Cada request HTTP processado pelo backend gera uma linha aqui (excluindo
-- /actuator/**, /static/**, /favicon.ico). Suporta:
--   - investigacao de incidentes ("quem chamou que endpoint a que horas?")
--   - dashboards de utilizacao por endpoint
--   - rate-limit retroativo / deteccao de abuse patterns
--
-- Volume esperado: ~5-20 req/s em pico => 0.5M-1.7M rows/dia.
-- Particionamento por mes sera adicionado no Sprint 2 (R.ICP refactor).

CREATE TABLE api_access_log (
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip          VARCHAR(45),                -- IPv4 ou IPv6
    username    VARCHAR(64),                -- preferred_username do JWT (NULL para chamadas anonimas/internas)
    method      VARCHAR(8) NOT NULL,
    path        VARCHAR(512) NOT NULL,
    query       VARCHAR(2048),              -- query string (sem o leading ?)
    status      INT NOT NULL,
    latency_ms  INT NOT NULL,
    user_agent  VARCHAR(255)
);

-- Index principal: queries sao quase sempre por janela temporal recente.
CREATE INDEX idx_api_access_log_ts ON api_access_log(ts DESC);

-- Index para "actividade do user X" e "endpoint Y mais chamado".
CREATE INDEX idx_api_access_log_username_ts ON api_access_log(username, ts DESC)
    WHERE username IS NOT NULL;
CREATE INDEX idx_api_access_log_path_ts ON api_access_log(path, ts DESC);

-- Index para deteccao de erros (4xx/5xx).
CREATE INDEX idx_api_access_log_status_ts ON api_access_log(status, ts DESC)
    WHERE status >= 400;
