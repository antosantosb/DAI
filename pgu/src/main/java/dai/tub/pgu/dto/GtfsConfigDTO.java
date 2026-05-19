package dai.tub.pgu.dto;

import java.time.Instant;

public class GtfsConfigDTO
{
    private boolean scheduleActive;
    private int intervalHours;
    private String gtfsUrl;
    private Instant nextRun;

    public GtfsConfigDTO() {}

    // GET
    public boolean isScheduleActive()  { return scheduleActive; }
    public int     getIntervalHours()  { return intervalHours; }
    public String  getGtfsUrl()        { return gtfsUrl; }
    public Instant getNextRun()        { return nextRun; }

    // SET
    public void setScheduleActive(boolean active)     { this.scheduleActive = active; }
    public void setIntervalHours(int intervalHours)   { this.intervalHours = intervalHours; }
    public void setGtfsUrl(String gtfsUrl)            { this.gtfsUrl = gtfsUrl; }
    public void setNextRun(Instant nextRun)           { this.nextRun = nextRun; }
}
