package dai.tub.pgu.service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;

import dai.tub.pgu.domain.VehicleSensor;
import dai.tub.pgu.dto.SensorFrameDTO;
import dai.tub.pgu.repository.VehicleSensorRepository;

/**
 * Fase C (Passo 1): escrita do snapshot de saude do MAIN SENSOR, isolada numa
 * transacao {@code REQUIRES_NEW} propria.
 *
 * <p>Esta' deliberadamente num bean separado de {@link SensorIngestService}: o
 * {@code REQUIRES_NEW} so' e' aplicado pelo proxy do Spring em chamadas
 * cross-bean. Se este metodo vivesse no mesmo bean da ingestao e fosse chamado
 * por self-invocation, o proxy seria ignorado e a anotacao nao teria efeito
 * (o mesmo motivo pelo qual o {@code recordPulseByName} vive no
 * {@code DataSourceHealthService} e e' chamado de fora). Mantemos assim o
 * snapshot do sensor incapaz de poluir ou fazer rollback do caminho critico
 * posicao->telemetria->livemap.
 */
@Service
public class VehicleSensorSnapshotWriter {

    private static final Logger log = LoggerFactory.getLogger(VehicleSensorSnapshotWriter.class);

    // ObjectMapper partilhado e thread-safe, so' para serializar o bloco de
    // sub-sensores para o texto JSON guardado em vehicle_sensor.subsensor_health.
    private static final ObjectMapper JSON = new ObjectMapper();

    // Limiar de saude abaixo do qual o main sensor e' marcado como AVARIA.
    private static final double HEALTH_FAULT_THRESHOLD = 0.4;

    private final VehicleSensorRepository sensorRepository;

    public VehicleSensorSnapshotWriter(VehicleSensorRepository sensorRepository) {
        this.sensorRepository = sensorRepository;
    }

    /**
     * Actualiza o snapshot do main sensor: subsensor_health (bloco serializado),
     * last_reading_at (agora) e status derivado da saude minima dos sub-sensores.
     *
     * <p>REQUIRES_NEW: escrita acessoria na sua propria transacao read-write, para
     * nunca participar nem envenenar a transacao da ingestao de telemetria.
     * Tolerante a falhas: nunca propaga excecao para nao partir a ingestao (mesmo
     * padrao do recordPulseByName).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void updateSnapshot(String gateway, SensorFrameDTO frame) {
        try {
            VehicleSensor sensor = sensorRepository.findByGateway(gateway).orElse(null);
            if (sensor == null) return;

            sensor.setSubsensorHealth(serializeSubsensors(frame.getSubsensors()));
            sensor.setLastReadingAt(frame.getTimestamp() != null ? frame.getTimestamp() : Instant.now());
            sensor.setStatus(deriveStatus(frame.getSubsensors()));
            sensorRepository.save(sensor);
        } catch (Exception e) {
            // Best-effort: o snapshot do sensor nunca pode partir a ingestao.
            log.warn("Falha a actualizar snapshot do main sensor '{}': {}", gateway, e.getMessage());
        }
    }

    /**
     * Estado derivado de forma simples: se algum sub-sensor reportar saude abaixo
     * do limiar -> "AVARIA"; caso contrario -> "ATIVO". Sem sub-sensores ou sem
     * qualquer saude reportada mantem-se "ATIVO" (chegou um frame, o sensor vive).
     */
    private String deriveStatus(Map<String, SensorFrameDTO.SubSensor> subsensors) {
        if (subsensors == null || subsensors.isEmpty()) return "ATIVO";
        for (SensorFrameDTO.SubSensor sub : subsensors.values()) {
            if (sub != null && sub.getHealth() != null && sub.getHealth() < HEALTH_FAULT_THRESHOLD) {
                return "AVARIA";
            }
        }
        return "ATIVO";
    }

    /**
     * Serializa o bloco de sub-sensores para o texto JSON guardado em
     * vehicle_sensor.subsensor_health (jsonb). Normaliza para um mapa simples e
     * estavel (value/health/boarded/alighted/onboard apenas quando presentes), de
     * forma a que o VehicleSensorDTO o leia de volta como Map sem problemas.
     */
    private String serializeSubsensors(Map<String, SensorFrameDTO.SubSensor> subsensors) {
        if (subsensors == null || subsensors.isEmpty()) return null;
        try {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<String, SensorFrameDTO.SubSensor> e : subsensors.entrySet()) {
                SensorFrameDTO.SubSensor sub = e.getValue();
                if (sub == null) continue;
                Map<String, Object> node = new LinkedHashMap<>();
                if (sub.getValue() != null)    node.put("value", sub.getValue());
                if (sub.getHealth() != null)   node.put("health", sub.getHealth());
                if (sub.getBoarded() != null)  node.put("boarded", sub.getBoarded());
                if (sub.getAlighted() != null) node.put("alighted", sub.getAlighted());
                if (sub.getOnboard() != null)  node.put("onboard", sub.getOnboard());
                out.put(e.getKey(), node);
            }
            return JSON.writeValueAsString(out);
        } catch (Exception ex) {
            log.warn("Falha a serializar sub-sensores: {}", ex.getMessage());
            return null;
        }
    }
}
