package dai.tub.pgu.dto;

/**
 * Payload WebSocket para progresso de importação GTFS.
 * Enviado em /topic/gtfs/progress
 */
public class GtfsProgressDTO
{
    private Long   importId;
    private String step;       // DOWNLOADING, PROCESSING_STOPS, PROCESSING_ROUTES, PROCESSING_SCHEDULES, COMPLETED, FAILED, SKIPPED
    private String message;
    private int    progress;   // 0-100

    public GtfsProgressDTO() {}

    public GtfsProgressDTO(Long importId, String step, String message, int progress)
    {
        this.importId = importId;
        this.step     = step;
        this.message  = message;
        this.progress = progress;
    }

    public Long   getImportId() { return importId; }
    public String getStep()     { return step; }
    public String getMessage()  { return message; }
    public int    getProgress() { return progress; }

    public void setImportId(Long importId) { this.importId = importId; }
    public void setStep(String step)       { this.step = step; }
    public void setMessage(String message) { this.message = message; }
    public void setProgress(int progress)  { this.progress = progress; }
}
