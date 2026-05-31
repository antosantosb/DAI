package dai.tub.pgu.controller;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.domain.VehicleDiagnostic;
import dai.tub.pgu.repository.VehicleDiagnosticRepository;

/**
 * Sprint 4 (3.2): controller de diagnostico OBD/CAN.
 *  POST /api/v1/diagnostics/ingest  — M2M, ingest de frames do NiFi
 *  GET  /api/v1/diagnostics/latest  — snapshot mais recente por bus
 *  GET  /api/v1/diagnostics/stats   — KPIs por powertrain (FleetHealth)
 */
@RestController
@RequestMapping("/api/v1/diagnostics")
public class VehicleDiagnosticController {

    private static final Logger log = LoggerFactory.getLogger(VehicleDiagnosticController.class);
    private final VehicleDiagnosticRepository repo;

    public VehicleDiagnosticController(VehicleDiagnosticRepository repo) {
        this.repo = repo;
    }

    @PostMapping("/ingest")
    public ResponseEntity<Void> ingest(@RequestBody Map<String, Object> body) {
        try {
            VehicleDiagnostic d = new VehicleDiagnostic();
            d.setBusId((String) body.get("busId"));
            d.setPowertrain((String) body.getOrDefault("powertrain", "DIESEL"));
            d.setRecordedAt(body.get("recordedAt") == null
                ? Instant.now()
                : Instant.parse(body.get("recordedAt").toString()));
            // genericos
            d.setOdometerKm(toBig(body.get("odometerKm")));
            d.setServiceHours(toBig(body.get("serviceHours")));
            d.setDoorOpenCount(toInt(body.get("doorOpenCount")));
            d.setAmbientTempC(toBig(body.get("ambientTempC")));
            d.setSpeedKmh(toBig(body.get("speedKmh")));
            // combustao
            d.setEngineRpm(toInt(body.get("engineRpm")));
            d.setCoolantTempC(toBig(body.get("coolantTempC")));
            d.setOilPressureBar(toBig(body.get("oilPressureBar")));
            // DIESEL
            d.setFuelLevelPct(toShort(body.get("fuelLevelPct")));
            d.setAdblueLevelPct(toShort(body.get("adblueLevelPct")));
            d.setDpfSootPct(toShort(body.get("dpfSootPct")));
            // CNG
            d.setCngPressureBar(toBig(body.get("cngPressureBar")));
            d.setCngLevelPct(toShort(body.get("cngLevelPct")));
            // ELECTRIC
            d.setSocPct(toShort(body.get("socPct")));
            d.setSohPct(toShort(body.get("sohPct")));
            d.setRegenKw(toBig(body.get("regenKw")));
            d.setMotorKw(toBig(body.get("motorKw")));
            d.setDtcCodes((String) body.get("dtcCodes"));
            repo.save(d);
            return ResponseEntity.status(HttpStatus.ACCEPTED).build();
        } catch (Exception e) {
            log.warn("[DIAG] ingest falhou: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/latest")
    public ResponseEntity<List<VehicleDiagnostic>> latest() {
        return ResponseEntity.ok(repo.findLatestPerBus());
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("activeByPowertrain24h", repo.countActiveByPowertrain24h());
        Double soh = repo.avgSoh24h();
        Double dpf = repo.avgDpf24h();
        r.put("avgSoh24h", soh == null ? 0 : Math.round(soh));
        r.put("avgDpf24h", dpf == null ? 0 : Math.round(dpf));
        return ResponseEntity.ok(r);
    }

    private static BigDecimal toBig(Object o) {
        if (o == null) return null;
        return new BigDecimal(o.toString());
    }
    private static Integer toInt(Object o) {
        if (o == null) return null;
        return Integer.valueOf(o.toString());
    }
    private static Short toShort(Object o) {
        if (o == null) return null;
        return Short.valueOf(o.toString());
    }
}
