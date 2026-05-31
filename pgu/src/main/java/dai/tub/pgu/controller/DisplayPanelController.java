package dai.tub.pgu.controller;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.domain.DisplayPanel;
import dai.tub.pgu.service.DisplayPanelService;

/**
 * Sprint 3 (3.5): CRUD + heartbeat dos paineis DMS.
 *
 * Endpoints:
 *  GET    /api/v1/panels           — lista
 *  POST   /api/v1/panels           — criar (admin)
 *  GET    /api/v1/panels/{id}      — detalhe
 *  PUT    /api/v1/panels/{id}      — actualizar (admin)
 *  DELETE /api/v1/panels/{id}      — eliminar (admin)
 *  POST   /api/v1/panels/heartbeat — heartbeat M2M (X-API-Key, do NiFi)
 *  GET    /api/v1/panels/stats     — agregados por status/tipo
 */
@RestController
@RequestMapping("/api/v1/panels")
public class DisplayPanelController {

    private final DisplayPanelService service;

    public DisplayPanelController(DisplayPanelService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<DisplayPanel>> list() {
        return ResponseEntity.ok(service.list());
    }

    @GetMapping("/{id}")
    public ResponseEntity<DisplayPanel> get(@PathVariable Long id) {
        return ResponseEntity.ok(service.get(id));
    }

    @PostMapping
    public ResponseEntity<DisplayPanel> create(@RequestBody DisplayPanel p) {
        return ResponseEntity.ok(service.create(p));
    }

    @PutMapping("/{id}")
    public ResponseEntity<DisplayPanel> update(@PathVariable Long id, @RequestBody DisplayPanel p) {
        return ResponseEntity.ok(service.update(id, p));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Recebe heartbeats vindos do MQTT (via NiFi). Payload aceita:
     *  { panelCode, batteryPct?, temperatureC?, firmware?, status? }
     */
    @PostMapping("/heartbeat")
    public ResponseEntity<Void> heartbeat(@RequestBody Map<String, Object> body) {
        String code = (String) body.get("panelCode");
        if (code == null) code = (String) body.get("code");
        Short battery = body.get("batteryPct") == null ? null
            : Short.valueOf(body.get("batteryPct").toString());
        BigDecimal temp = body.get("temperatureC") == null ? null
            : new BigDecimal(body.get("temperatureC").toString());
        String firmware = (String) body.get("firmware");
        String status = (String) body.get("status");
        service.recordHeartbeat(code, battery, temp, firmware, status);
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        return ResponseEntity.ok(service.stats());
    }
}
