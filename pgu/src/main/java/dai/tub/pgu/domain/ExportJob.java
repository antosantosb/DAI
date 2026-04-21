package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "export_job")
public class ExportJob
{
    public enum Format { CSV, PDF }
    public enum Status { PENDING, PROCESSING, COMPLETED, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "job_uuid", nullable = false, unique = true)
    private UUID jobUuid;

    @Column(name = "requested_by")
    private String requestedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private Format format;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    @Column(name = "bus_id_filter")
    private String busIdFilter;

    @Column(name = "from_ts")
    private Instant fromTs;

    @Column(name = "to_ts")
    private Instant toTs;

    @Column(name = "file_path")
    private String filePath;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "row_count")
    private Long rowCount;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    public ExportJob() {}

    @PrePersist
    void onCreate()
    {
        if (this.createdAt == null) this.createdAt = Instant.now();
        if (this.jobUuid == null)   this.jobUuid   = UUID.randomUUID();
        if (this.status == null)    this.status    = Status.PENDING;
    }

    // GET
    public Long    getId()           { return id; }
    public UUID    getJobUuid()      { return jobUuid; }
    public String  getRequestedBy()  { return requestedBy; }
    public Format  getFormat()       { return format; }
    public Status  getStatus()       { return status; }
    public String  getBusIdFilter()  { return busIdFilter; }
    public Instant getFromTs()       { return fromTs; }
    public Instant getToTs()         { return toTs; }
    public String  getFilePath()     { return filePath; }
    public String  getFileName()     { return fileName; }
    public Long    getRowCount()     { return rowCount; }
    public String  getErrorMessage() { return errorMessage; }
    public Instant getCreatedAt()    { return createdAt; }
    public Instant getStartedAt()    { return startedAt; }
    public Instant getCompletedAt()  { return completedAt; }

    // SET
    public void setId(Long id)                       { this.id = id; }
    public void setJobUuid(UUID jobUuid)             { this.jobUuid = jobUuid; }
    public void setRequestedBy(String requestedBy)   { this.requestedBy = requestedBy; }
    public void setFormat(Format format)             { this.format = format; }
    public void setStatus(Status status)             { this.status = status; }
    public void setBusIdFilter(String busIdFilter)   { this.busIdFilter = busIdFilter; }
    public void setFromTs(Instant fromTs)            { this.fromTs = fromTs; }
    public void setToTs(Instant toTs)                { this.toTs = toTs; }
    public void setFilePath(String filePath)         { this.filePath = filePath; }
    public void setFileName(String fileName)         { this.fileName = fileName; }
    public void setRowCount(Long rowCount)           { this.rowCount = rowCount; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public void setCreatedAt(Instant createdAt)      { this.createdAt = createdAt; }
    public void setStartedAt(Instant startedAt)      { this.startedAt = startedAt; }
    public void setCompletedAt(Instant completedAt)  { this.completedAt = completedAt; }
}
