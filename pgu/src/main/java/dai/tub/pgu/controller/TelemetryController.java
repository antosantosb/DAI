package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.dto.BusHealthDTO;
import dai.tub.pgu.dto.SensorFrameDTO;
import dai.tub.pgu.service.TelemetryService;
import dai.tub.pgu.service.SensorIngestService;

/**
 * Sprint -1 (BE-9): controller fica thin. Broadcast WS moveu-se para o service
 * (processAndSaveTelemetry) — assim corre dentro da mesma transacao (@Transactional)
 * e fica testavel sem MockMvc.
 */
@RestController
@RequestMapping("/api/v1/telemetry")
public class TelemetryController
{
    private final TelemetryService telemetryService;
    private final SensorIngestService sensorIngestService;

    public TelemetryController(TelemetryService telemetryService,
                               SensorIngestService sensorIngestService)
    {
        this.telemetryService = telemetryService;
        this.sensorIngestService = sensorIngestService;
    }

    // GET — Usado pelo Frontend para obter telemetria histórica
    @GetMapping
    public ResponseEntity<List<TelemetryDTO>> getAllTelemetry()
    {
        List<TelemetryDTO> data = telemetryService.getAllTelemetry();

        if (data.isEmpty()) return ResponseEntity.noContent().build();

        return ResponseEntity.ok().body(data);
    }

    // GET — Última telemetria de cada autocarro
    @GetMapping("/latest")
    public ResponseEntity<List<TelemetryDTO>> getLatestPerBus()
    {
        List<TelemetryDTO> data = telemetryService.getLatestPerBus();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    // GET — Dashboard de saúde dos autocarros
    @GetMapping("/health")
    public ResponseEntity<List<BusHealthDTO>> getBusHealthStatuses()
    {
        List<BusHealthDTO> data = telemetryService.getBusHealthStatuses();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    // POST — Usado pelo NiFi (InvokeHTTP) para ingerir dados transformados.
    // Caminho LEGADO keyed por autocarro (busId). Mantido intacto.
    @PostMapping("/ingest")
    public ResponseEntity<Void> ingestTelemetry(@RequestBody TelemetryDTO telemetry)
    {
        // Service trata de persistir + broadcast WS atomicamente
        telemetryService.processAndSaveTelemetry(telemetry);
        return ResponseEntity.ok().build();
    }

    // POST — Fase C (Passo 1): ingestao keyed pelo MAIN SENSOR (sensorId + bloco
    // de sub-sensores). O backend resolve o autocarro pela atribuicao sensor->bus
    // e reaproveita o mesmo caminho de persistencia (posicao, APC, livemap).
    @PostMapping("/ingest/sensor")
    public ResponseEntity<Void> ingestSensorFrame(@RequestBody SensorFrameDTO frame)
    {
        // Tolerante: sensor desconhecido/nao atribuido e' ignorado com seguranca.
        sensorIngestService.ingestSensorFrame(frame);
        return ResponseEntity.ok().build();
    }
}
