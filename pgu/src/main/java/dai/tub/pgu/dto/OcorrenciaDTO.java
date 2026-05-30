package dai.tub.pgu.dto;

import java.time.Instant;

public class OcorrenciaDTO {
    private Long id;
    private String ativoId;
    private String tipoAtivo;
    private String tipoAnomalia;
    private String descricao;
    private String prioridade;
    private String estado;
    private Instant timestampAbertura;
    private Instant timestampAssumida;
    private Instant timestampFecho;
    private String responsavel;
    private String notasIniciais;
    private String acaoCorretiva;
    private String falsoPositivoJustificacao;
    private boolean reincidencia;
    private Long ocorrenciaPaiId;
    private Object telemetriaSnapshot;
    private String criadoPor;

    public OcorrenciaDTO() {}

    // GETTERS
    public Long getId() { return id; }
    public String getAtivoId() { return ativoId; }
    public String getTipoAtivo() { return tipoAtivo; }
    public String getTipoAnomalia() { return tipoAnomalia; }
    public String getDescricao() { return descricao; }
    public String getPrioridade() { return prioridade; }
    public String getEstado() { return estado; }
    public Instant getTimestampAbertura() { return timestampAbertura; }
    public Instant getTimestampAssumida() { return timestampAssumida; }
    public Instant getTimestampFecho() { return timestampFecho; }
    public String getResponsavel() { return responsavel; }
    public String getNotasIniciais() { return notasIniciais; }
    public String getAcaoCorretiva() { return acaoCorretiva; }
    public String getFalsoPositivoJustificacao() { return falsoPositivoJustificacao; }
    public boolean isReincidencia() { return reincidencia; }
    public Long getOcorrenciaPaiId() { return ocorrenciaPaiId; }
    public Object getTelemetriaSnapshot() { return telemetriaSnapshot; }
    public String getCriadoPor() { return criadoPor; }

    // SETTERS
    public void setId(Long id) { this.id = id; }
    public void setAtivoId(String ativoId) { this.ativoId = ativoId; }
    public void setTipoAtivo(String tipoAtivo) { this.tipoAtivo = tipoAtivo; }
    public void setTipoAnomalia(String tipoAnomalia) { this.tipoAnomalia = tipoAnomalia; }
    public void setDescricao(String descricao) { this.descricao = descricao; }
    public void setPrioridade(String prioridade) { this.prioridade = prioridade; }
    public void setEstado(String estado) { this.estado = estado; }
    public void setTimestampAbertura(Instant timestampAbertura) { this.timestampAbertura = timestampAbertura; }
    public void setTimestampAssumida(Instant timestampAssumida) { this.timestampAssumida = timestampAssumida; }
    public void setTimestampFecho(Instant timestampFecho) { this.timestampFecho = timestampFecho; }
    public void setResponsavel(String responsavel) { this.responsavel = responsavel; }
    public void setNotasIniciais(String notasIniciais) { this.notasIniciais = notasIniciais; }
    public void setAcaoCorretiva(String acaoCorretiva) { this.acaoCorretiva = acaoCorretiva; }
    public void setFalsoPositivoJustificacao(String falsoPositivoJustificacao) { this.falsoPositivoJustificacao = falsoPositivoJustificacao; }
    public void setReincidencia(boolean reincidencia) { this.reincidencia = reincidencia; }
    public void setOcorrenciaPaiId(Long ocorrenciaPaiId) { this.ocorrenciaPaiId = ocorrenciaPaiId; }
    public void setTelemetriaSnapshot(Object telemetriaSnapshot) { this.telemetriaSnapshot = telemetriaSnapshot; }
    public void setCriadoPor(String criadoPor) { this.criadoPor = criadoPor; }
}
