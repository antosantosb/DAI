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
    private ExportJob.Format    format;
    private ExportJob.Status    status;
    private String              fileName;
    private Long                rowCount;
    private String              downloadUrl;  // preenchido quando COMPLETED
    private String              errorMessage;
    private Instant             createdAt;
    private Instant             completedAt;

    public ExportJobDTO() {}

    public static ExportJobDTO fromEntity(ExportJob j)
    {
        ExportJobDTO d = new ExportJobDTO();
        d.jobUuid      = j.getJobUuid();
        d.format       = j.getFormat();
        d.status       = j.getStatus();
        d.fileName     = j.getFileName();
        d.rowCount     = j.getRowCount();
        d.errorMessage = j.getErrorMessage();
        d.createdAt    = j.getCreatedAt();
        d.completedAt  = j.getCompletedAt();
        if (j.getStatus() == ExportJob.Status.COMPLETED)
            d.downloadUrl = "/api/v1/exports/" + j.getJobUuid() + "/download";
        return d;
    }

    public UUID                getJobUuid()      { return jobUuid; }
    public ExportJob.Format    getFormat()       { return format; }
    public ExportJob.Status    getStatus()       { return status; }
    public String              getFileName()     { return fileName; }
    public Long                getRowCount()     { return rowCount; }
    public String              getDownloadUrl()  { return downloadUrl; }
    public String              getErrorMessage() { return errorMessage; }
    public Instant             getCreatedAt()    { return createdAt; }
    public Instant             getCompletedAt()  { return completedAt; }

    public void setJobUuid(UUID v)              { this.jobUuid = v; }
    public void setFormat(ExportJob.Format v)   { this.format = v; }
    public void setStatus(ExportJob.Status v)   { this.status = v; }
    public void setFileName(String v)           { this.fileName = v; }
    public void setRowCount(Long v)             { this.rowCount = v; }
    public void setDownloadUrl(String v)        { this.downloadUrl = v; }
    public void setErrorMessage(String v)       { this.errorMessage = v; }
    public void setCreatedAt(Instant v)         { this.createdAt = v; }
    public void setCompletedAt(Instant v)       { this.completedAt = v; }
}
