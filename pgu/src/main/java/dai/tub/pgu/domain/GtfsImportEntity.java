package dai.tub.pgu.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "gtfs_import_entity")
public class GtfsImportEntity
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "import_id", nullable = false)
    private GtfsImport gtfsImport;

    @Column(name = "entity_type", nullable = false, length = 20)
    private String entityType; // STOP, ROUTE, ROUTE_STOP, SEGMENT

    @Column(name = "entity_id", nullable = false)
    private Long entityId;

    public GtfsImportEntity() {}

    public GtfsImportEntity(GtfsImport gtfsImport, String entityType, Long entityId)
    {
        this.gtfsImport = gtfsImport;
        this.entityType = entityType;
        this.entityId = entityId;
    }

    // GET
    public Long       getId()         { return id; }
    public GtfsImport getGtfsImport() { return gtfsImport; }
    public String     getEntityType() { return entityType; }
    public Long       getEntityId()   { return entityId; }

    // SET
    public void setId(Long id)                       { this.id = id; }
    public void setGtfsImport(GtfsImport gtfsImport) { this.gtfsImport = gtfsImport; }
    public void setEntityType(String entityType)     { this.entityType = entityType; }
    public void setEntityId(Long entityId)           { this.entityId = entityId; }
}
