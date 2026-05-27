-- F9: Suporte ao novo estado CANCELED para o motor de exportação.
--
-- A coluna `status` em export_job já é VARCHAR(16) (ver V8) e o valor é
-- mantido aplicacionalmente via EnumType.STRING — portanto basta garantir
-- que comporta o valor 'CANCELED' (8 chars, OK) e que não há check constraints
-- legacy que o rejeitem.
--
-- Esta migration é idempotente: pode correr múltiplas vezes sem efeito
-- colateral. Não há alteração de schema, apenas defesa contra envs antigos
-- onde um check constraint pudesse limitar os valores.

DO $$
BEGIN
    -- Se existir algum check constraint num env antigo a limitar status,
    -- remove-o (não há um conhecido, mas previne surpresas).
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'export_job' AND column_name = 'status'
          AND constraint_name LIKE '%status_check%'
    ) THEN
        EXECUTE 'ALTER TABLE export_job DROP CONSTRAINT IF EXISTS export_job_status_check';
    END IF;
END$$;

-- Garante o tamanho mínimo (idempotente: ALTER COLUMN TYPE ... USING).
ALTER TABLE export_job ALTER COLUMN status TYPE VARCHAR(16);

-- Índice já existe desde V8; nada a fazer.
