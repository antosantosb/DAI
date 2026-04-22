-- Fix: V11 created id as SERIAL (int4), but JPA entity uses Long (int8/bigint)
-- Hibernate validation fails with: wrong column type in [historico_alertas].[id]
ALTER TABLE historico_alertas
    ALTER COLUMN id SET DATA TYPE BIGINT;

-- Also convert the sequence to BIGINT (SERIAL creates an int4 sequence)
ALTER SEQUENCE historico_alertas_id_seq AS BIGINT;
