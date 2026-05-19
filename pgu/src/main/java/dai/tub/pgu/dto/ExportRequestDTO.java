package dai.tub.pgu.dto;

import dai.tub.pgu.domain.ExportJob;
import java.time.Instant;

/**
 * Pedido de exportação submetido pelo Backoffice.
 * Formato: CSV ou PDF. Filtros opcionais por busId e janela temporal.
 */
public class ExportRequestDTO
{
    private ExportJob.Format   format;    // CSV | PDF
    private ExportJob.DataType dataType;  // TELEMETRY | AUDIT_LOG
    private String  busId;               // opcional (telemetria)
    private Instant from;                // opcional
    private Instant to;                  // opcional
    private String  requestedBy;         // username / JWT subject

    public ExportRequestDTO() {}

    public ExportJob.Format   getFormat()      { return format; }
    public ExportJob.DataType getDataType()    { return dataType; }
    public String             getBusId()       { return busId; }
    public Instant            getFrom()        { return from; }
    public Instant            getTo()          { return to; }
    public String             getRequestedBy() { return requestedBy; }

    public void setFormat(ExportJob.Format format)       { this.format = format; }
    public void setDataType(ExportJob.DataType dataType) { this.dataType = dataType; }
    public void setBusId(String busId)                   { this.busId = busId; }
    public void setFrom(Instant from)                    { this.from = from; }
    public void setTo(Instant to)                        { this.to = to; }
    public void setRequestedBy(String requestedBy)       { this.requestedBy = requestedBy; }
}
