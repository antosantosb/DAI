package dai.tub.pgu.controller;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashMap;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.domain.FareConfig;
import dai.tub.pgu.domain.ValidationEvent;
import dai.tub.pgu.dto.ValidationEventDTO;
import dai.tub.pgu.repository.FareConfigRepository;
import dai.tub.pgu.repository.ValidationEventRepository;
import dai.tub.pgu.service.ValidationService;

/**
 * Sprint 5 (3.3): controller completo de bilhetica.
 *
 * Endpoints:
 *  - POST /validations               — ingest M2M (X-API-Key), persiste real
 *  - GET  /validations/stats         — agregados 24h para o dashboard
 *  - GET  /validations/field-check   — apoio a fiscalizacao por bus+hora
 *  - GET  /fare-config               — consulta tarifario
 *  - GET  /fare-config/lookup        — preco aplicavel
 */
@RestController
@RequestMapping("/api/v1")
public class ValidationController
{
    private static final Logger log = LoggerFactory.getLogger(ValidationController.class);

    private final ValidationService validationService;
    private final ValidationEventRepository veRepo;
    private final FareConfigRepository fareRepo;

    public ValidationController(ValidationService validationService,
                                ValidationEventRepository veRepo,
                                FareConfigRepository fareRepo)
    {
        this.validationService = validationService;
        this.veRepo = veRepo;
        this.fareRepo = fareRepo;
    }

    @PostMapping("/validations")
    public ResponseEntity<Map<String, Object>> ingest(@RequestBody Map<String, Object> body)
    {
        try {
            ValidationEventDTO dto = new ValidationEventDTO();
            dto.setEventType((String) body.get("eventType"));
            dto.setBusId((String) body.get("busId"));
            dto.setStopId(body.get("stopId") == null ? null : Long.valueOf(body.get("stopId").toString()));
            dto.setRouteId(body.get("routeId") == null ? null : Long.valueOf(body.get("routeId").toString()));
            dto.setLatitude(body.get("lat") == null ? null : Double.valueOf(body.get("lat").toString()));
            dto.setLongitude(body.get("lon") == null ? null : Double.valueOf(body.get("lon").toString()));
            dto.setSource((String) body.get("source"));
            if (body.get("validatedAt") != null) {
                dto.setValidatedAt(OffsetDateTime.parse(body.get("validatedAt").toString()));
            }
            String cardReal = (String) body.get("cardId");
            String channel  = (String) body.getOrDefault("channel", body.get("source"));
            String category = (String) body.getOrDefault("fareCategory", "NORMAL");
            Long id = validationService.ingest(dto, cardReal, channel, category);
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("eventId", id);
            return ResponseEntity.status(HttpStatus.CREATED).body(resp);
        } catch (Exception e) {
            log.warn("[VAL] ingest falhou: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", String.valueOf(e.getMessage())));
        }
    }

    @GetMapping("/validations/stats")
    public ResponseEntity<Map<String, Object>> stats()
    {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("total24h",   veRepo.totalLast24h());
        r.put("byHour",     veRepo.demandByHour24h());
        r.put("byLine",     veRepo.demandByLine24h());
        r.put("byChannel",  veRepo.demandByChannel24h());
        r.put("byCategory", veRepo.demandByCategory24h());
        r.put("byZone",     veRepo.demandByZone24h());
        return ResponseEntity.ok(r);
    }

    @GetMapping("/validations/field-check")
    public ResponseEntity<List<Map<String, Object>>> fieldCheck(
        @RequestParam String busId,
        @RequestParam String at)
    {
        OffsetDateTime mid = OffsetDateTime.parse(at);
        OffsetDateTime from = mid.minusMinutes(30);
        OffsetDateTime to   = mid.plusMinutes(30);
        List<ValidationEvent> events = veRepo.findByBusIdAndValidatedAtBetweenOrderByValidatedAtAsc(busId, from, to);
        List<Map<String, Object>> out = events.stream().map(e -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", e.getId());
            m.put("ticketId", e.getTicketId());
            m.put("eventType", e.getEventType());
            m.put("validatedAt", e.getValidatedAt().toString());
            m.put("source", e.getSource());
            m.put("stopId", e.getStopId());
            m.put("routeId", e.getRouteId());
            return m;
        }).toList();
        return ResponseEntity.ok(out);
    }

    @GetMapping("/fare-config")
    public ResponseEntity<List<FareConfig>> fareConfig()
    {
        return ResponseEntity.ok(fareRepo.findAllByOrderByTicketTypeAscCoroasAscValidFromDesc());
    }

    @GetMapping("/fare-config/lookup")
    public ResponseEntity<FareConfig> lookup(
        @RequestParam String channel,
        @RequestParam short coroas,
        @RequestParam(defaultValue = "NORMAL") String category)
    {
        return validationService.lookupFare(channel, coroas, category, LocalDate.now())
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
