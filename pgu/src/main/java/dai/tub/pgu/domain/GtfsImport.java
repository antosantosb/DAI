package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "gtfs_import")
public class GtfsImport
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String source; // UPLOAD, TUB_MANUAL, TUB_SCHEDULED

    @Column(nullable = false, length = 20)
    private String status; // PROCESSING, COMPLETED, FAILED, REVERTED

    @Column(length = 255)
    private String filename;

    @Column(name = "stops_created", nullable = false)
    private int stopsCreated;

    @Column(name = "stops_updated", nullable = false)
    private int stopsUpdated;

    @Column(name = "routes_created", nullable = false)
    private int routesCreated;

    @Column(name = "routes_updated", nullable = false)
    private int routesUpdated;

    @Column(name = "shapes_loaded", nullable = false)
    private int shapesLoaded;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_by", length = 100)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "reverted_at")
    private Instant revertedAt;

    public GtfsImport() { this.createdAt = Instant.now(); }

    // GET
    public Long    getId()             { return id; }
    public String  getSource()         { return source; }
    public String  getStatus()         { return status; }
    public String  getFilename()       { return filename; }
    public int     getStopsCreated()   { return stopsCreated; }
    public int     getStopsUpdated()   { return stopsUpdated; }
    public int     getRoutesCreated()  { return routesCreated; }
    public int     getRoutesUpdated()  { return routesUpdated; }
    public int     getShapesLoaded()   { return shapesLoaded; }
    public String  getErrorMessage()   { return errorMessage; }
    public String  getCreatedBy()      { return createdBy; }
    public Instant getCreatedAt()      { return createdAt; }
    public Instant getFinishedAt()     { return finishedAt; }
    public Instant getRevertedAt()     { return revertedAt; }

    // SET
    public void setId(Long id)                       { this.id = id; }
    public void setSource(String source)             { this.source = source; }
    public void setStatus(String status)             { this.status = status; }
    public void setFilename(String filename)         { this.filename = filename; }
    public void setStopsCreated(int v)               { this.stopsCreated = v; }
    public void setStopsUpdated(int v)               { this.stopsUpdated = v; }
    public void setRoutesCreated(int v)              { this.routesCreated = v; }
    public void setRoutesUpdated(int v)              { this.routesUpdated = v; }
    public void setShapesLoaded(int v)               { this.shapesLoaded = v; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public void setCreatedBy(String createdBy)       { this.createdBy = createdBy; }
    public void setCreatedAt(Instant createdAt)      { this.createdAt = createdAt; }
    public void setFinishedAt(Instant finishedAt)    { this.finishedAt = finishedAt; }
    public void setRevertedAt(Instant revertedAt)    { this.revertedAt = revertedAt; }
}
