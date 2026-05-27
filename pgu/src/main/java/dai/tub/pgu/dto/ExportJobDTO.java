package dai.tub.pgu.dto;

import dai.tub.pgu.domain.ExportJob;
import java.time.Instant;
import java.util.UUID;

/**
 * Projeção leve do estado de um ExportJob para o Frontend.
 * Também usado como payload da notificação WebSocket em /topic/exports.
 */
public class ExportJobDTO
{
    private UUID                jobUuid;
    private ExportJob.DataType  dataType;
    private ExportJob.Format    format;
    private ExportJob.Status    status;
    private String              fileName;
    private Long                fileSize;     // F9 (MinIO): bytes do objeto, util para UI
    private Long                rowCount;
    /**
     * Endpoint relativo para pedir a presigned URL on-demand
     * ({@code GET /api/v1/exports/{uuid}/download-url}). Mantemos o nome
     * {@code downloadUrl} para nao quebrar o frontend existente; o frontend
     * detecta endpoints {@code /api/v1/...} e troca por uma chamada que
     * recebe a presigned URL fresca cada vez.
     */
    private String              downloadUrl;  // preenchido quando COMPLETED
    private String              errorMessage;
    private Instant             createdAt;
    private Instant             completedAt;
    private String              requestedBy;  // F9: necessário para coluna "Criado por"

    public ExportJobDTO() {}

    public static ExportJobDTO fromEntity(ExportJob j)
    {
        ExportJobDTO d = new ExportJobDTO();
        d.jobUuid      = j.getJobUuid();
        d.dataType     = j.getDataType();
        d.format       = j.getFormat();
        d.status       = j.getStatus();
        d.fileName     = j.getFileName();
        d.fileSize     = j.getFileSize();
        d.rowCount     = j.getRowCount();
        d.errorMessage = j.getErrorMessage();
        d.createdAt    = j.getCreatedAt();
        d.completedAt  = j.getCompletedAt();
        d.requestedBy  = j.getRequestedBy();
        if (j.getStatus() == ExportJob.Status.COMPLETED)
        {
            // F9 (MinIO migration): apontar para o endpoint que gera presigned URL
            // on-demand. O frontend faz GET a este caminho e usa a URL devolvida
            // (que aponta diretamente para o MinIO) para descarregar.
            d.downloadUrl = "/api/v1/exports/" + j.getJobUuid() + "/download-url";
        }
        return d;
    }

    public UUID                getJobUuid()      { return jobUuid; }
    public ExportJob.DataType  getDataType()     { return dataType; }
    public ExportJob.Format    getFormat()       { return format; }
    public ExportJob.Status    getStatus()       { return status; }
    public String              getFileName()     { return fileName; }
    public Long                getFileSize()     { return fileSize; }
    public Long                getRowCount()     { return rowCount; }
    public String              getDownloadUrl()  { return downloadUrl; }
    public String              getErrorMessage() { return errorMessage; }
    public Instant             getCreatedAt()    { return createdAt; }
    public Instant             getCompletedAt()  { return completedAt; }
    public String              getRequestedBy()  { return requestedBy; }

    public void setJobUuid(UUID v)                { this.jobUuid = v; }
    public void setDataType(ExportJob.DataType v) { this.dataType = v; }
    public void setFormat(ExportJob.Format v)     { this.format = v; }
    public void setStatus(ExportJob.Status v)   { this.status = v; }
    public void setFileName(String v)           { this.fileName = v; }
    public void setFileSize(Long v)             { this.fileSize = v; }
    public void setRowCount(Long v)             { this.rowCount = v; }
    public void setDownloadUrl(String v)        { this.downloadUrl = v; }
    public void setErrorMessage(String v)       { this.errorMessage = v; }
    public void setCreatedAt(Instant v)         { this.createdAt = v; }
    public void setCompletedAt(Instant v)       { this.completedAt = v; }
    public void setRequestedBy(String v)        { this.requestedBy = v; }
}
