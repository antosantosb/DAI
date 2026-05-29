package dai.tub.pgu.controller;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.BusStopDTO;
import dai.tub.pgu.dto.StopPanelDTO;
import dai.tub.pgu.service.BusStopService;
import dai.tub.pgu.service.GeoJsonExportService;
import dai.tub.pgu.service.StopPanelService;

@RestController
@RequestMapping("/api/v1/stops")
public class BusStopController
{
    private static final Logger log = LoggerFactory.getLogger(BusStopController.class);
    private final BusStopService busStopService;
    private final StopPanelService stopPanelService;
    private final GeoJsonExportService geoJsonExportService;

    public BusStopController(BusStopService busStopService,
                             StopPanelService stopPanelService,
                             GeoJsonExportService geoJsonExportService)
    {
        this.busStopService = busStopService;
        this.stopPanelService = stopPanelService;
        this.geoJsonExportService = geoJsonExportService;
    }

    /**
     * Sprint 1 (F1): export GeoJSON FeatureCollection com todas as paragens (R.BO.01).
     * Aberto (permitAll via SecurityConfig) para integração com QGIS / dados.gov.pt.
     */
    @GetMapping(value = "/export.geojson", produces = "application/geo+json")
    public ResponseEntity<Map<String, Object>> exportGeoJson()
    {
        Map<String, Object> fc = geoJsonExportService.exportStops();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"pgu-stops.geojson\"")
                .contentType(MediaType.parseMediaType("application/geo+json"))
                .body(fc);
    }

    @GetMapping
    public ResponseEntity<List<BusStopDTO>> getAll()
    {
        List<BusStopDTO> stops = busStopService.getAll();
        return stops.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(stops);
    }

    @GetMapping("/{id}")
    public ResponseEntity<BusStopDTO> getById(@PathVariable Long id)
    {
        return ResponseEntity.ok(busStopService.getById(id));
    }

    @PostMapping
    @LogActivity(action = "Criar paragem")
    public ResponseEntity<BusStopDTO> create(@RequestBody BusStopDTO dto)
    {
        try
        {
            return ResponseEntity.status(201).body(busStopService.create(dto));
        }
        catch (DataIntegrityViolationException e)
        {
            log.info("[UPSERT] Paragem '{}' criada por outro thread, a fazer retry", dto.getCode());
            return ResponseEntity.ok(busStopService.create(dto));
        }
    }

    @PatchMapping("/{id}")
    @LogActivity(action = "Atualizar paragem")
    public ResponseEntity<BusStopDTO> update(@PathVariable Long id, @RequestBody BusStopDTO dto)
    {
        return ResponseEntity.ok(busStopService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @LogActivity(action = "Eliminar paragem")
    public ResponseEntity<Void> delete(@PathVariable Long id)
    {
        busStopService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/panel")
    public ResponseEntity<StopPanelDTO> getPanel(@PathVariable Long id)
    {
        return ResponseEntity.ok(stopPanelService.getPanel(id));
    }
}
