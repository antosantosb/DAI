package dai.tub.pgu.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "gtfs_config")
public class GtfsConfig
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "schedule_active", nullable = false)
    private boolean scheduleActive;

    @Column(name = "interval_hours", nullable = false)
    private int intervalHours;

    @Column(name = "gtfs_url", nullable = false, length = 500)
    private String gtfsUrl;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public GtfsConfig() { this.updatedAt = Instant.now(); }

    // GET
    public Long    getId()             { return id; }
    public boolean isScheduleActive()  { return scheduleActive; }
    public int     getIntervalHours()  { return intervalHours; }
    public String  getGtfsUrl()        { return gtfsUrl; }
    public Instant getUpdatedAt()      { return updatedAt; }

    // SET
    public void setId(Long id)                        { this.id = id; }
    public void setScheduleActive(boolean active)     { this.scheduleActive = active; }
    public void setIntervalHours(int intervalHours)   { this.intervalHours = intervalHours; }
    public void setGtfsUrl(String gtfsUrl)            { this.gtfsUrl = gtfsUrl; }
    public void setUpdatedAt(Instant updatedAt)       { this.updatedAt = updatedAt; }
}
