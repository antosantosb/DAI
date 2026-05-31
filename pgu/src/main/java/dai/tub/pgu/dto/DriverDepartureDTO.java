package dai.tub.pgu.dto;

import java.time.Instant;

/**
 * Hora X do motorista (painel de bordo): o instante exacto em que tem de
 * sair da central TUB para chegar a tempo a' primeira paragem da primeira
 * trip da escala de hoje.
 *
 * <p>Calculo: {@code horaX = plannedStart - (distancia_OSRM / velocidade_media)}.
 * Velocidade media: AVG(speed_kmh) da frota nos ultimos 7 dias, fallback 30 km/h.
 *
 * <p>{@code mode}: BEFORE (cronometro decrescente), AFTER (alerta de atraso),
 * NO_SCHEDULE (sem escala planeada para hoje).
 */
public class DriverDepartureDTO
{
    private String mode;                 // BEFORE | AFTER | NO_SCHEDULE
    private Instant horaX;
    private Instant plannedStart;
    private String firstStopName;
    private Long firstStopId;
    private Double distanceMeters;
    private Double avgSpeedKmh;
    private Integer driveTimeSeconds;
    private Long delayMinutes;           // so' em AFTER

    public DriverDepartureDTO() {}

    public String  getMode()              { return this.mode; }
    public Instant getHoraX()             { return this.horaX; }
    public Instant getPlannedStart()      { return this.plannedStart; }
    public String  getFirstStopName()     { return this.firstStopName; }
    public Long    getFirstStopId()       { return this.firstStopId; }
    public Double  getDistanceMeters()    { return this.distanceMeters; }
    public Double  getAvgSpeedKmh()       { return this.avgSpeedKmh; }
    public Integer getDriveTimeSeconds()  { return this.driveTimeSeconds; }
    public Long    getDelayMinutes()      { return this.delayMinutes; }

    public void setMode(String mode)                  { this.mode = mode; }
    public void setHoraX(Instant when)                { this.horaX = when; }
    public void setPlannedStart(Instant when)         { this.plannedStart = when; }
    public void setFirstStopName(String name)         { this.firstStopName = name; }
    public void setFirstStopId(Long id)               { this.firstStopId = id; }
    public void setDistanceMeters(Double m)           { this.distanceMeters = m; }
    public void setAvgSpeedKmh(Double kmh)            { this.avgSpeedKmh = kmh; }
    public void setDriveTimeSeconds(Integer s)        { this.driveTimeSeconds = s; }
    public void setDelayMinutes(Long m)               { this.delayMinutes = m; }
}
