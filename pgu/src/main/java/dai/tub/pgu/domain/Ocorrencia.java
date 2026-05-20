package dai.tub.pgu.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Entity
@Table(name = "ocorrencias")
public class Ocorrencia {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ativo_id", nullable = false, length = 50)
    private String ativoId;

    @Column(name = "tipo_ativo", nullable = false, length = 20)
    private String tipoAtivo = "BUS"; // BUS | CHARGER

    @Column(name = "tipo_anomalia", nullable = false, length = 100)
    private String tipoAnomalia;

    @Column(columnDefinition = "TEXT")
    private String descricao;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PrioridadeOcorrencia prioridade = PrioridadeOcorrencia.NORMAL;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private EstadoOcorrencia estado = EstadoOcorrencia.ABERTA;

    @Column(name = "timestamp_abertura", nullable = false)
    private Instant timestampAbertura = Instant.now();

    @Column(name = "timestamp_assumida")
    private Instant timestampAssumida;

    @Column(name = "timestamp_fecho")
    private Instant timestampFecho;

    @Column(length = 100)
    private String responsavel;

    @Column(name = "notas_iniciais", columnDefinition = "TEXT")
    private String notasIniciais;

    @Column(name = "acao_corretiva", columnDefinition = "TEXT")
    private String acaoCorretiva;

    @Column(name = "falso_positivo_justificacao", columnDefinition = "TEXT")
    private String falsoPositivoJustificacao;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ocorrencia_pai_id")
    private Ocorrencia ocorrenciaPai;

    @Column(nullable = false)
    private boolean reincidencia = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "telemetria_snapshot", columnDefinition = "jsonb")
    private String telemetriaSnapshot;

    @Column(name = "criado_por", length = 100)
    private String criadoPor;

    public Ocorrencia() {}

    // GETTERS
    public Long getId() { return id; }
    public String getAtivoId() { return ativoId; }
    public String getTipoAtivo() { return tipoAtivo; }
    public String getTipoAnomalia() { return tipoAnomalia; }
    public String getDescricao() { return descricao; }
    public PrioridadeOcorrencia getPrioridade() { return prioridade; }
    public EstadoOcorrencia getEstado() { return estado; }
    public Instant getTimestampAbertura() { return timestampAbertura; }
    public Instant getTimestampAssumida() { return timestampAssumida; }
    public Instant getTimestampFecho() { return timestampFecho; }
    public String getResponsavel() { return responsavel; }
    public String getNotasIniciais() { return notasIniciais; }
    public String getAcaoCorretiva() { return acaoCorretiva; }
    public String getFalsoPositivoJustificacao() { return falsoPositivoJustificacao; }
    public Ocorrencia getOcorrenciaPai() { return ocorrenciaPai; }
    public boolean isReincidencia() { return reincidencia; }
    public String getTelemetriaSnapshot() { return telemetriaSnapshot; }
    public String getCriadoPor() { return criadoPor; }

    // SETTERS
    public void setId(Long id) { this.id = id; }
    public void setAtivoId(String ativoId) { this.ativoId = ativoId; }
    public void setTipoAtivo(String tipoAtivo) { this.tipoAtivo = tipoAtivo; }
    public void setTipoAnomalia(String tipoAnomalia) { this.tipoAnomalia = tipoAnomalia; }
    public void setDescricao(String descricao) { this.descricao = descricao; }
    public void setPrioridade(PrioridadeOcorrencia prioridade) { this.prioridade = prioridade; }
    public void setEstado(EstadoOcorrencia estado) { this.estado = estado; }
    public void setTimestampAbertura(Instant timestampAbertura) { this.timestampAbertura = timestampAbertura; }
    public void setTimestampAssumida(Instant timestampAssumida) { this.timestampAssumida = timestampAssumida; }
    public void setTimestampFecho(Instant timestampFecho) { this.timestampFecho = timestampFecho; }
    public void setResponsavel(String responsavel) { this.responsavel = responsavel; }
    public void setNotasIniciais(String notasIniciais) { this.notasIniciais = notasIniciais; }
    public void setAcaoCorretiva(String acaoCorretiva) { this.acaoCorretiva = acaoCorretiva; }
    public void setFalsoPositivoJustificacao(String falsoPositivoJustificacao) { this.falsoPositivoJustificacao = falsoPositivoJustificacao; }
    public void setOcorrenciaPai(Ocorrencia ocorrenciaPai) { this.ocorrenciaPai = ocorrenciaPai; }
    public void setReincidencia(boolean reincidencia) { this.reincidencia = reincidencia; }
    public void setTelemetriaSnapshot(String telemetriaSnapshot) { this.telemetriaSnapshot = telemetriaSnapshot; }
    public void setCriadoPor(String criadoPor) { this.criadoPor = criadoPor; }
}
