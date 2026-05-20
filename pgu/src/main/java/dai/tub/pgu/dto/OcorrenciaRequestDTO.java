package dai.tub.pgu.dto;

public class OcorrenciaRequestDTO {

    public static class RegistarOcorrenciaRequest {
        private String ativoId;
        private String tipoAtivo; // BUS | CHARGER
        private String tipoAnomalia;
        private String descricao;
        private String prioridade; // CRITICA | NORMAL
        private String notasIniciais;

        public RegistarOcorrenciaRequest() {}

        // GETTERS
        public String getAtivoId() { return ativoId; }
        public String getTipoAtivo() { return tipoAtivo; }
        public String getTipoAnomalia() { return tipoAnomalia; }
        public String getDescricao() { return descricao; }
        public String getPrioridade() { return prioridade; }
        public String getNotasIniciais() { return notasIniciais; }

        // SETTERS
        public void setAtivoId(String ativoId) { this.ativoId = ativoId; }
        public void setTipoAtivo(String tipoAtivo) { this.tipoAtivo = tipoAtivo; }
        public void setTipoAnomalia(String tipoAnomalia) { this.tipoAnomalia = tipoAnomalia; }
        public void setDescricao(String descricao) { this.descricao = descricao; }
        public void setPrioridade(String prioridade) { this.prioridade = prioridade; }
        public void setNotasIniciais(String notasIniciais) { this.notasIniciais = notasIniciais; }
    }

    public static class AssumirOcorrenciaRequest {
        public AssumirOcorrenciaRequest() {}
    }

    public static class FecharOcorrenciaRequest {
        private String acaoCorretiva;
        private boolean falsoPositivo;
        private String justificacao;

        public FecharOcorrenciaRequest() {}

        // GETTERS
        public String getAcaoCorretiva() { return acaoCorretiva; }
        public boolean isFalsoPositivo() { return falsoPositivo; }
        public String getJustificacao() { return justificacao; }

        // SETTERS
        public void setAcaoCorretiva(String acaoCorretiva) { this.acaoCorretiva = acaoCorretiva; }
        public void setFalsoPositivo(boolean falsoPositivo) { this.falsoPositivo = falsoPositivo; }
        public void setJustificacao(String justificacao) { this.justificacao = justificacao; }
    }

    public static class AdicionarAnexoRequest {
        private String nomeFicheiro;
        private Long tamanhoBytes;
        private String mimeType;

        public AdicionarAnexoRequest() {}

        // GETTERS
        public String getNomeFicheiro() { return nomeFicheiro; }
        public Long getTamanhoBytes() { return tamanhoBytes; }
        public String getMimeType() { return mimeType; }

        // SETTERS
        public void setNomeFicheiro(String nomeFicheiro) { this.nomeFicheiro = nomeFicheiro; }
        public void setTamanhoBytes(Long tamanhoBytes) { this.tamanhoBytes = tamanhoBytes; }
        public void setMimeType(String mimeType) { this.mimeType = mimeType; }
    }
}
