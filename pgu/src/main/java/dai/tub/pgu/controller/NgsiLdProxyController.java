package dai.tub.pgu.controller;

import dai.tub.pgu.service.NgsiLdService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * Sprint 0 (F3): proxy NGSI-LD sobre o FIWARE Orion (R.INT.06).
 *
 * <p>Exposto em {@code /api/v1/ngsi-ld/**}. Devolve {@code application/ld+json}
 * (Content-Type oficial NGSI-LD v1.6).
 *
 * <p>Endpoints (todos exigem JWT):
 * <ul>
 *   <li>{@code GET /entities?type=Vehicle&limit=100&offset=0}</li>
 *   <li>{@code GET /entities/{id}}</li>
 *   <li>{@code GET /types}</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/ngsi-ld")
@RequiredArgsConstructor
public class NgsiLdProxyController {

    private static final MediaType LD_JSON = MediaType.parseMediaType("application/ld+json");

    private final NgsiLdService service;

    @GetMapping(value = "/entities", produces = "application/ld+json")
    public ResponseEntity<List<Map<String, Object>>> listEntities(
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(defaultValue = "0") int offset
    ) {
        List<Map<String, Object>> result = service.listEntities(type, limit, offset);
        return ResponseEntity.ok().contentType(LD_JSON).body(result);
    }

    @GetMapping(value = "/entities/{id}", produces = "application/ld+json")
    public ResponseEntity<Map<String, Object>> getEntity(@PathVariable String id) {
        try {
            Map<String, Object> entity = service.getEntity(id);
            return ResponseEntity.ok().contentType(LD_JSON).body(entity);
        } catch (NgsiLdService.NotFound nf) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, nf.getMessage());
        } catch (HttpClientErrorException.NotFound nf) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Entity " + id + " nao encontrada no Orion");
        }
    }

    @GetMapping(value = "/types", produces = "application/ld+json")
    public ResponseEntity<List<String>> listTypes() {
        return ResponseEntity.ok().contentType(LD_JSON).body(service.listTypes());
    }
}
