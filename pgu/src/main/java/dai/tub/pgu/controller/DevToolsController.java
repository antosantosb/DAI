package dai.tub.pgu.controller;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sprint 1 follow-up: Ferramentas de simulacao para demos.
 *
 * Endpoints placeholder — apenas registam o pedido nos logs e devolvem 200.
 * NAO ha efeitos reais no sistema (sem alteracoes a buses, telemetria, etc.).
 * Servem para validar a wiring role/route/security do role "developer".
 *
 * Acesso restrito ao role realm "developer" (Keycloak).
 */
@RestController
@RequestMapping("/api/v1/dev")
@PreAuthorize("hasRole('developer')")
public class DevToolsController
{
    private static final Logger log = LoggerFactory.getLogger(DevToolsController.class);

    @PostMapping("/simulate/bus-delay")
    public ResponseEntity<Map<String, String>> simulateBusDelay(@RequestBody Map<String, Object> body)
    {
        Object busId = body.get("busId");
        Object delaySeconds = body.get("delaySeconds");
        log.info("[DEV-SIM] Simulated delay {}s on bus {}", delaySeconds, busId);
        return ResponseEntity.ok(Map.of("status", "queued"));
    }

    @PostMapping("/simulate/add-passengers")
    public ResponseEntity<Map<String, String>> simulateAddPassengers(@RequestBody Map<String, Object> body)
    {
        Object busId = body.get("busId");
        Object count = body.get("count");
        log.info("[DEV-SIM] Simulated {} extra passengers on bus {}", count, busId);
        return ResponseEntity.ok(Map.of("status", "queued"));
    }
}
