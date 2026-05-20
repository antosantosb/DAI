package dai.tub.pgu.dto;

import java.time.Instant;

public class GtfsImportDTO
{
    private Long id;
    private String source;
    private String status;
    private String filename;
    private int stopsCreated;
    private int stopsUpdated;
    private int routesCreated;
    private int routesUpdated;
    private int shapesLoaded;
    private long schedulesLoaded;
    private String errorMessage;
    private String createdBy;
    private Instant createdAt;
    private Instant finishedAt;
    private Instant revertedAt;
    private boolean canRevert;

    public GtfsImportDTO() {}

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
    public long    getSchedulesLoaded() { return schedulesLoaded; }
    public String  getErrorMessage()   { return errorMessage; }
    public String  getCreatedBy()      { return createdBy; }
    public Instant getCreatedAt()      { return createdAt; }
    public Instant getFinishedAt()     { return finishedAt; }
    public Instant getRevertedAt()     { return revertedAt; }
    public boolean isCanRevert()       { return canRevert; }

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
    public void setSchedulesLoaded(long v)           { this.schedulesLoaded = v; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public void setCreatedBy(String createdBy)       { this.createdBy = createdBy; }
    public void setCreatedAt(Instant createdAt)      { this.createdAt = createdAt; }
    public void setFinishedAt(Instant finishedAt)    { this.finishedAt = finishedAt; }
    public void setRevertedAt(Instant revertedAt)    { this.revertedAt = revertedAt; }
    public void setCanRevert(boolean canRevert)      { this.canRevert = canRevert; }
}
