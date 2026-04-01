package dai.tub.pgu.dto;

import java.util.List;

public class StopPanelDTO
{
    private Long stopId;
    private String stopName;
    private String stopCode;
    private String panelMessage;
    private List<StopEtaDTO> etas;

    public StopPanelDTO() {}

    // GET
    public Long            getStopId()       { return this.stopId; }
    public String          getStopName()     { return this.stopName; }
    public String          getStopCode()     { return this.stopCode; }
    public String          getPanelMessage() { return this.panelMessage; }
    public List<StopEtaDTO> getEtas()        { return this.etas; }

    // SET
    public void setStopId(Long id)                  { this.stopId = id; }
    public void setStopName(String name)            { this.stopName = name; }
    public void setStopCode(String code)            { this.stopCode = code; }
    public void setPanelMessage(String msg)         { this.panelMessage = msg; }
    public void setEtas(List<StopEtaDTO> etas)      { this.etas = etas; }
}
