package dai.tub.pgu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.VehicleSensor;
import dai.tub.pgu.dto.SensorFrameDTO;
import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.VehicleSensorRepository;

/**
 * Fase C (Passo 1): ingestao de telemetria identificada pelo MAIN SENSOR.
 *
 * <p>Recebe o frame novo ({@link SensorFrameDTO}), resolve o autocarro pela
 * atribuicao sensor->bus e reaproveita o caminho de persistencia ja' existente
 * ({@link TelemetryService#processAndSaveTelemetry}) para que a posicao, a APC
 * (boarded/alighted/onboard), o livemap e os alarmes de ocupacao continuem a
 * funcionar exactamente como antes.
 *
 * <p>Resolucao do autocarro: o frame traz {@code sensorId} (codigo do gateway).
 * {@code vehicle_sensor.gateway -> vehicle_sensor.bus_id (Long, FK buses.id) ->
 * Bus.busCode (String)}. E' o {@code busCode} que alimenta o {@link TelemetryDTO}
 * (cujo {@code busId} e' o codigo do autocarro, nao o id numerico).
 *
 * <p>Apos persistir a telemetria, delega a actualizacao do snapshot do main
 * sensor (subsensor_health, last_reading_at, status derivado) no
 * {@link VehicleSensorSnapshotWriter}, que corre em {@code REQUIRES_NEW}. A
 * chamada e' cross-bean de proposito, para o proxy do Spring aplicar a nova
 * transacao (self-invocation ignoraria a anotacao). Assim o snapshot do sensor
 * nunca poderia poluir nem fazer rollback do caminho critico
 * posicao->telemetria->livemap.
 *
 * <p>Compatibilidade: se o frame nao trouxer {@code sensorId} mas trouxer
 * {@code busId} (codigo do autocarro), cai no caminho legado keyed por autocarro.
 */
@Service
public class SensorIngestService {

    private static final Logger log = LoggerFactory.getLogger(SensorIngestService.class);

    private final TelemetryService telemetryService;
    private final VehicleSensorRepository sensorRepository;
    private final BusRepository busRepository;
    private final VehicleSensorSnapshotWriter snapshotWriter;
    private final DataSourceHealthService healthService;

    public SensorIngestService(TelemetryService telemetryService,
                               VehicleSensorRepository sensorRepository,
                               BusRepository busRepository,
                               VehicleSensorSnapshotWriter snapshotWriter,
                               DataSourceHealthService healthService) {
        this.telemetryService = telemetryService;
        this.sensorRepository = sensorRepository;
        this.busRepository = busRepository;
        this.snapshotWriter = snapshotWriter;
        this.healthService = healthService;
    }

    /**
     * Ponto de entrada da ingestao keyed por sensor.
     *
     * <p>Prefere sempre o {@code sensorId}. Se ausente e existir {@code busId}, usa
     * o caminho legado (frame antigo). Nada e' persistido se nao houver forma de
     * identificar o autocarro ou se o sensor nao estiver atribuido (sem rebentar).
     */
    public void ingestSensorFrame(SensorFrameDTO frame) {
        if (frame == null) {
            log.warn("[INGEST] Frame de telemetria NULO ignorado.");
            return;
        }

        // Compatibilidade: frame antigo keyed por autocarro (busId presente, sem
        // sensorId). Reaproveita integralmente o caminho legado.
        boolean hasSensorId = frame.getSensorId() != null && !frame.getSensorId().isBlank();
        if (!hasSensorId) {
            if (frame.getBusId() != null && !frame.getBusId().isBlank()) {
                log.info("[INGEST] Frame LEGADO busId='{}' -> persist", frame.getBusId());
                telemetryService.processAndSaveTelemetry(toTelemetryDTO(frame, frame.getBusId()));
                return;
            }
            log.warn("[INGEST] Frame SEM sensorId NEM busId ignorado. payload={}", frame);
            return;
        }

        log.debug("[INGEST] Frame sensorId='{}' lat={} lon={} speed={}",
                frame.getSensorId(), frame.getLat(), frame.getLon(), frame.getSpeed());

        // Resolve o main sensor pelo codigo do gateway.
        VehicleSensor sensor = sensorRepository.findByGateway(frame.getSensorId()).orElse(null);
        if (sensor == null) {
            log.warn("[INGEST] sensorId='{}' NAO existe no inventario (vehicle_sensor.gateway).",
                    frame.getSensorId());
            return;
        }

        // Resolve o autocarro atribuido (bus_id -> Bus.busCode).
        if (sensor.getBusId() == null) {
            log.warn("[INGEST] sensorId='{}' encontrado mas SEM busId atribuido. " +
                    "Atribui o sensor a um autocarro em /backoffice/sensors.", frame.getSensorId());
            snapshotWriter.updateSnapshot(frame.getSensorId(), frame);
            return;
        }

        String busCode = busRepository.findById(sensor.getBusId()).map(Bus::getBusCode).orElse(null);
        if (busCode == null) {
            log.warn("[INGEST] sensorId='{}' aponta para bus_id={} mas o Bus NAO existe.",
                    frame.getSensorId(), sensor.getBusId());
            snapshotWriter.updateSnapshot(frame.getSensorId(), frame);
            return;
        }

        // Sanity: lat/lon obrigatorios para o livemap. Sem coordenadas nao
        // podemos construir o Point PostGIS — gera-se NPE no service ao
        // criar `new Coordinate(null, null)`. Descarta o frame com log claro.
        if (frame.getLat() == null || frame.getLon() == null) {
            log.warn("[INGEST] sensorId='{}' -> busCode='{}' SEM lat/lon (lat={}, lon={}) — frame descartado.",
                    frame.getSensorId(), busCode, frame.getLat(), frame.getLon());
            return;
        }

        log.info("[INGEST] sensorId='{}' -> busCode='{}' lat={} lon={} speed={} -> persist",
                frame.getSensorId(), busCode, frame.getLat(), frame.getLon(), frame.getSpeed());

        // CAMINHO CRITICO: persiste posicao + APC exactamente como o pipeline antigo.
        // Reusa processAndSaveTelemetry (livemap, broadcast WS, alarmes de ocupacao).
        telemetryService.processAndSaveTelemetry(toTelemetryDTO(frame, busCode));

        // Acessorio: snapshot de saude do main sensor, isolado em REQUIRES_NEW
        // (cross-bean, para o proxy aplicar). Best-effort, nunca parte a ingestao.
        snapshotWriter.updateSnapshot(frame.getSensorId(), frame);

        // Observabilidade: pulsa as duas DataSources que cobrem este caminho.
        //   * "Main sensors"    -> saude do equipamento fisico (gateway a transmitir).
        //   * "Telemetry ingest"-> saude do canal de ingestao (NiFi -> backend).
        // Ambas eram pulsadas no caminho legado /ingest; no /ingest/sensor faltava,
        // por isso o "Telemetry ingest" ficava com "No data". recordPulseByName e
        // best-effort (REQUIRES_NEW, engole excecoes), nao parte a ingestao.
        healthService.recordPulseByName(TelemetryService.DS_MAIN_SENSORS, "sensor frame");
        healthService.recordPulseByName(TelemetryService.DS_TELEMETRY_INGEST, "sensor frame via ingest/sensor");
    }

    /**
     * Converte o frame do sensor no {@link TelemetryDTO} que o pipeline legado
     * espera. Extrai a APC do sub-sensor "passageiros"; tudo o resto e' posicao /
     * cinematica / estado. O {@code busId} do DTO e' o codigo do autocarro.
     */
    private TelemetryDTO toTelemetryDTO(SensorFrameDTO frame, String busCode) {
        TelemetryDTO dto = new TelemetryDTO();
        dto.setBusId(busCode);
        dto.setLatitude(frame.getLat());
        dto.setLongitude(frame.getLon());
        dto.setSpeed(frame.getSpeed());
        dto.setTimestamp(frame.getTimestamp());
        dto.setStatus(frame.getStatus());

        // APC a partir do sub-sensor "passageiros" (boarded/alighted/onboard).
        // Mantem a mesma semantica nullable do pipeline antigo: "nao reportado"
        // fica null e o TelemetryService faz o fallback onboard = passengerCount.
        SensorFrameDTO.SubSensor pax = frame.getSubsensors() != null
                ? frame.getSubsensors().get("passageiros")
                : null;
        if (pax != null) {
            dto.setBoarded(pax.getBoarded());
            dto.setAlighted(pax.getAlighted());
            dto.setOnboard(pax.getOnboard());
            // passengerCount (int, nao nullable) espelha o onboard quando presente,
            // para os dashboards/analytics que leem passenger_count continuarem certos.
            if (pax.getOnboard() != null) {
                dto.setPassengers(pax.getOnboard());
            }
        }
        return dto;
    }
}
