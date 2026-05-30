package dai.tub.pgu.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.PatternAuthoringDTO.CreatePatternRequest;
import dai.tub.pgu.dto.PatternAuthoringDTO.PreviewGeometryRequest;
import dai.tub.pgu.dto.RouteDTO;
import dai.tub.pgu.service.GeoJsonExportService;
import dai.tub.pgu.service.PatternService;
import dai.tub.pgu.service.RouteService;

@RestController
@RequestMapping("/api/v1/routes")
public class RouteController
{
    private static final Logger log = LoggerFactory.getLogger(RouteController.class);
    private final RouteService routeService;
    private final GeoJsonExportService geoJsonExportService;
    private final PatternService patternService;

    public RouteController(RouteService routeService,
                           GeoJsonExportService geoJsonExportService,
                           PatternService patternService)
    {
        this.routeService = routeService;
        this.geoJsonExportService = geoJsonExportService;
        this.patternService = patternService;
    }

    /**
     * Sprint 1 (F1): export GeoJSON FeatureCollection com todas as rotas (R.BO.01).
     * Aberto (permitAll via SecurityConfig) para integração com QGIS / dados.gov.pt.
     */
    @GetMapping(value = "/export.geojson", produces = "application/geo+json")
    public ResponseEntity<Map<String, Object>> exportGeoJson()
    {
        Map<String, Object> fc = geoJsonExportService.exportRoutes();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"pgu-routes.geojson\"")
                .contentType(MediaType.parseMediaType("application/geo+json"))
                .body(fc);
    }

    @GetMapping
    public ResponseEntity<List<RouteDTO>> getAll()
    {
        List<RouteDTO> routes = routeService.getAll();
        return routes.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(routes);
    }

    @GetMapping("/{id}")
    public ResponseEntity<RouteDTO> getById(@PathVariable Long id)
    {
        return ResponseEntity.ok(routeService.getById(id));
    }

    @PostMapping
    @LogActivity(action = "Criar rota")
    public ResponseEntity<RouteDTO> create(@RequestBody RouteDTO dto)
    {
        try
        {
            return ResponseEntity.status(201).body(routeService.create(dto));
        }
        catch (DataIntegrityViolationException | UnexpectedRollbackException e)
        {
            log.info("[UPSERT] Rota '{}' — conflito concorrente ({}), retry como update", dto.getCode(), e.getClass().getSimpleName());
            return ResponseEntity.ok(routeService.create(dto));
        }
    }

    /**
     * Sprint 1 (F2): preview da geometria ajustada as estradas (OSRM) por uma
     * sequencia ordenada de pontos [lat, lon] (stops E waypoints, so coordenadas).
     * Devolve a polyline ajustada; com menos de 2 pontos ou sem resposta do OSRM,
     * devolve os pontos de entrada (a UI desenha uma recta como fallback).
     * Seguranca: POST /api/v1/routes/** -> admin/developer (SecurityConfig).
     */
    @PostMapping("/preview-geometry")
    public ResponseEntity<Map<String, Object>> previewGeometry(@RequestBody PreviewGeometryRequest body)
    {
        List<List<Double>> snapped = patternService.previewGeometry(body != null ? body.getPoints() : null);
        Map<String, Object> resp = new java.util.LinkedHashMap<>();
        resp.put("points", snapped);
        return ResponseEntity.ok(resp);
    }

    /**
     * Sprint 1 (F2): cria manualmente um padrao (JourneyPattern) numa rota a partir
     * de uma sequencia ordenada de STOPs e WAYPOINTs. Guarda apenas as STOPs e a
     * geometria ajustada (OSRM por todos os pontos). Devolve o padrao no mesmo
     * formato da listagem de padroes (id, directionId, name, stopCount, tripCount).
     * Seguranca: POST /api/v1/routes/** -> admin/developer (SecurityConfig).
     */
    @PostMapping("/{routeId}/patterns")
    @LogActivity(action = "Criar padrão")
    public ResponseEntity<Map<String, Object>> createPattern(@PathVariable Long routeId,
                                                             @RequestBody CreatePatternRequest body)
    {
        return ResponseEntity.status(201).body(patternService.createPattern(routeId, body));
    }

    /**
     * Sprint 1 (F2): edita um padrao existente, substituindo-o no lugar a partir de
     * uma nova sequencia ordenada de STOPs e WAYPOINTs (mesmo formato da criacao).
     * Recria paragens + geometria, actualiza nome/direcao/assinatura e a sequencia de
     * autoria. Devolve o padrao no mesmo formato da listagem (id, directionId, name,
     * stopCount, tripCount). 409 se a nova sequencia colidir com OUTRO padrao da rota.
     * Seguranca: PUT /api/v1/routes/** -> admin/developer (SecurityConfig).
     */
    @PutMapping("/{routeId}/patterns/{patternId}")
    @LogActivity(action = "Atualizar padrão")
    public ResponseEntity<Map<String, Object>> updatePattern(@PathVariable Long routeId,
                                                             @PathVariable Long patternId,
                                                             @RequestBody CreatePatternRequest body)
    {
        return ResponseEntity.ok(patternService.updatePattern(routeId, patternId, body));
    }

    /**
     * Sprint 1 (F2): apaga um padrao (JourneyPattern) e todos os seus filhos (trips +
     * passing-times, paragens e geometria) por ordem segura para as FKs. 404 se o
     * padrao nao existir; 400 se pertencer a outra rota. Devolve 204 No Content.
     * Seguranca: DELETE /api/v1/routes/** -> admin/developer (SecurityConfig).
     */
    @DeleteMapping("/{routeId}/patterns/{patternId}")
    @LogActivity(action = "Apagar padrão")
    public ResponseEntity<Void> deletePattern(@PathVariable Long routeId,
                                              @PathVariable Long patternId)
    {
        patternService.deletePattern(routeId, patternId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}")
    @LogActivity(action = "Atualizar rota")
    public ResponseEntity<RouteDTO> update(@PathVariable Long id, @RequestBody RouteDTO dto)
    {
        return ResponseEntity.ok(routeService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @LogActivity(action = "Eliminar rota")
    public ResponseEntity<Void> delete(@PathVariable Long id)
    {
        routeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
