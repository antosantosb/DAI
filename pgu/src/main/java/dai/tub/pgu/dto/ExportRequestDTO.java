package dai.tub.pgu.dto;

import dai.tub.pgu.domain.ExportJob;
import java.time.Instant;

/**
 * Pedido de exportação submetido pelo Backoffice.
 * Formato: CSV ou PDF. Filtros opcionais por busId e janela temporal.
 */
public class ExportRequestDTO
{
    private ExportJob.Format format;  // CSV | PDF
    private String  busId;            // opcional
    private Instant from;             // opcional
    private Instant to;               // opcional
    private String  requestedBy;      // username / JWT subject

    public ExportRequestDTO() {}

    public ExportJob.Format getFormat()      { return format; }
    public String           getBusId()       { return busId; }
    public Instant          getFrom()        { return from; }
    public Instant          getTo()          { return to; }
    public String           getRequestedBy() { return requestedBy; }

    public void setFormat(ExportJob.Format format)   { this.format = format; }
    public void setBusId(String busId)               { this.busId = busId; }
    public void setFrom(Instant from)                { this.from = from; }
    public void setTo(Instant to)                    { this.to = to; }
    public void setRequestedBy(String requestedBy)   { this.requestedBy = requestedBy; }
}
