package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.dto.BusHealthDTO;
import dai.tub.pgu.service.TelemetryService;

@RestController
@RequestMapping("/api/v1/telemetry")
public class TelemetryController
{
    private final TelemetryService telemetryService;
    private final SimpMessagingTemplate messagingTemplate;

    public TelemetryController(TelemetryService telemetryService, SimpMessagingTemplate messagingTemplate)
    {
        this.telemetryService = telemetryService;
        this.messagingTemplate = messagingTemplate;
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

    // POST — Usado pelo NiFi (InvokeHTTP) para ingerir dados transformados
    // Guarda na DW e faz broadcast via WebSocket para o Frontend
    @PostMapping("/ingest")
    public ResponseEntity<Void> ingestTelemetry(@RequestBody TelemetryDTO telemetry)
    {
        telemetryService.processAndSaveTelemetry(telemetry);

        // Broadcast em tempo real para todos os clientes WebSocket subscritos
        messagingTemplate.convertAndSend("/topic/telemetry", telemetry);

        return ResponseEntity.ok().build();
    }
}
