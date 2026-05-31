package dai.tub.pgu.dto;

/**
 * Sprint 5 (follow-up): contexto geografico de uma ocorrencia, usado pelo
 * painel do fiscal para se orientar ate ao local. Inclui localizacao do bus
 * (ultima telemetria conhecida) e paragem mais proxima (haversine).
 */
public class OcorrenciaLocationContextDTO
{
    private Long ocorrenciaId;
    private String ativoId;
    private Double busLat;
    private Double busLon;

    private Long nearestStopId;
    private String nearestStopName;
    private String nearestStopCode;
    private Double nearestStopLat;
    private Double nearestStopLon;
    private Integer nearestStopDistanceMeters;

    // Sprint 5 (follow-up): paragem para onde o bus se dirige agora — para o
    // fiscal poder intersetar o autocarro caso a fraude esteja em andamento.
    private Long destStopId;
    private String destStopName;
    private String destStopCode;
    private Double destStopLat;
    private Double destStopLon;
    private Integer destStopDistanceMeters;

    public OcorrenciaLocationContextDTO() {}

    // GET
    public Long    getOcorrenciaId()             { return ocorrenciaId; }
    public String  getAtivoId()                  { return ativoId; }
    public Double  getBusLat()                   { return busLat; }
    public Double  getBusLon()                   { return busLon; }
    public Long    getNearestStopId()            { return nearestStopId; }
    public String  getNearestStopName()          { return nearestStopName; }
    public String  getNearestStopCode()          { return nearestStopCode; }
    public Double  getNearestStopLat()           { return nearestStopLat; }
    public Double  getNearestStopLon()           { return nearestStopLon; }
    public Integer getNearestStopDistanceMeters(){ return nearestStopDistanceMeters; }
    public Long    getDestStopId()                { return destStopId; }
    public String  getDestStopName()              { return destStopName; }
    public String  getDestStopCode()              { return destStopCode; }
    public Double  getDestStopLat()               { return destStopLat; }
    public Double  getDestStopLon()               { return destStopLon; }
    public Integer getDestStopDistanceMeters()    { return destStopDistanceMeters; }

    // SET
    public void setOcorrenciaId(Long v)              { this.ocorrenciaId = v; }
    public void setAtivoId(String v)                 { this.ativoId = v; }
    public void setBusLat(Double v)                  { this.busLat = v; }
    public void setBusLon(Double v)                  { this.busLon = v; }
    public void setNearestStopId(Long v)             { this.nearestStopId = v; }
    public void setNearestStopName(String v)         { this.nearestStopName = v; }
    public void setNearestStopCode(String v)         { this.nearestStopCode = v; }
    public void setNearestStopLat(Double v)          { this.nearestStopLat = v; }
    public void setNearestStopLon(Double v)          { this.nearestStopLon = v; }
    public void setNearestStopDistanceMeters(Integer v) { this.nearestStopDistanceMeters = v; }
    public void setDestStopId(Long v)                 { this.destStopId = v; }
    public void setDestStopName(String v)             { this.destStopName = v; }
    public void setDestStopCode(String v)             { this.destStopCode = v; }
    public void setDestStopLat(Double v)              { this.destStopLat = v; }
    public void setDestStopLon(Double v)              { this.destStopLon = v; }
    public void setDestStopDistanceMeters(Integer v)  { this.destStopDistanceMeters = v; }
}
