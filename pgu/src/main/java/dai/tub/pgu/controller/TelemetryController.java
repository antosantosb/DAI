package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.service.TelemetryService;
import org.springframework.web.bind.annotation.GetMapping;

@RestController
@RequestMapping("/api/v1/telemetry")   
public class TelemetryController 
{
    private final TelemetryService telemetryService;

    public TelemetryController(TelemetryService telemetryService) 
    {
        this.telemetryService = telemetryService;
    }

    @GetMapping
    public ResponseEntity<List<TelemetryDTO>> getAllTelemetry() 
    {
        List<TelemetryDTO> data = telemetryService.getAllTelemetry();

        if (data.isEmpty()) return ResponseEntity.noContent().build();
        
        return ResponseEntity.ok().body(data);
    }
    
}
