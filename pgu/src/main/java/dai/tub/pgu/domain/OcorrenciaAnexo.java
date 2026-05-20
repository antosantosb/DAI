package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "ocorrencia_anexos")
public class OcorrenciaAnexo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ocorrencia_id", nullable = false)
    private Ocorrencia ocorrencia;

    @Column(name = "nome_ficheiro", nullable = false)
    private String nomeFicheiro;

    @Column(name = "tamanho_bytes", nullable = false)
    private Long tamanhoBytes;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(nullable = false, length = 500)
    private String caminho;

    @Column(name = "upload_por", length = 100)
    private String uploadPor;

    @Column(name = "upload_em", nullable = false)
    private Instant uploadEm = Instant.now();

    public OcorrenciaAnexo() {}

    // GETTERS
    public Long getId() { return id; }
    public Ocorrencia getOcorrencia() { return ocorrencia; }
    public String getNomeFicheiro() { return nomeFicheiro; }
    public Long getTamanhoBytes() { return tamanhoBytes; }
    public String getMimeType() { return mimeType; }
    public String getCaminho() { return caminho; }
    public String getUploadPor() { return uploadPor; }
    public Instant getUploadEm() { return uploadEm; }

    // SETTERS
    public void setId(Long id) { this.id = id; }
    public void setOcorrencia(Ocorrencia ocorrencia) { this.ocorrencia = ocorrencia; }
    public void setNomeFicheiro(String nomeFicheiro) { this.nomeFicheiro = nomeFicheiro; }
    public void setTamanhoBytes(Long tamanhoBytes) { this.tamanhoBytes = tamanhoBytes; }
    public void setMimeType(String mimeType) { this.mimeType = mimeType; }
    public void setCaminho(String caminho) { this.caminho = caminho; }
    public void setUploadPor(String uploadPor) { this.uploadPor = uploadPor; }
    public void setUploadEm(Instant uploadEm) { this.uploadEm = uploadEm; }
}
