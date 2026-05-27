-- Sprint 0 (F4 follow-up): owner das fontes passa a ser configuravel via
-- vars globais na pagina Parametros do backoffice. As fontes podem ter
-- owner proprio (override); se nao tiverem, o backend devolve o owner
-- global como fallback.

ALTER TABLE global_config
    ADD COLUMN IF NOT EXISTS default_owner_name  VARCHAR(64),
    ADD COLUMN IF NOT EXISTS default_owner_email VARCHAR(128);

-- Set valor inicial razoavel se ainda nao houver
UPDATE global_config
SET default_owner_name  = COALESCE(default_owner_name,  'Operações TUB'),
    default_owner_email = COALESCE(default_owner_email, 'operacoes@tub.pt');

-- Se a tabela esta vazia (caso de migracao inicial), inserir uma linha default
INSERT INTO global_config (default_owner_name, default_owner_email)
SELECT 'Operações TUB', 'operacoes@tub.pt'
WHERE NOT EXISTS (SELECT 1 FROM global_config);

-- Limpar os owners hardcoded das fontes seed para herdarem do global
UPDATE data_source
SET owner = NULL, contacto_email = NULL
WHERE owner = 'Equipa DAI';
