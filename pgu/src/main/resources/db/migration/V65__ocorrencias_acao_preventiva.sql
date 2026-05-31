-- Sprint 4 (3.2): ocorrencias.acao_preventiva — registo de manutencao
-- preventiva/preditiva (R.IMC.08). Campo livre para descrever a accao
-- tomada (ex.: "limpeza DPF agendada", "substituicao SoH < 80%").
ALTER TABLE ocorrencias
    ADD COLUMN IF NOT EXISTS acao_preventiva VARCHAR(256) NULL;

COMMENT ON COLUMN ocorrencias.acao_preventiva IS 'Sprint 4: accao de manutencao preventiva/preditiva associada (R.IMC.08).';
