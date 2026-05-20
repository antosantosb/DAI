package dai.tub.pgu.controller;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.GtfsConfigDTO;
import dai.tub.pgu.dto.GtfsImportDTO;
import dai.tub.pgu.dto.StopScheduleDTO;
import dai.tub.pgu.service.GtfsService;

@RestController
@RequestMapping("/api/v1/gtfs")
public class GtfsController
{
    private static final Logger log = LoggerFactory.getLogger(GtfsController.class);
    private final GtfsService gtfsService;

    public GtfsController(GtfsService gtfsService)
    {
        this.gtfsService = gtfsService;
    }

    /** Extrai preferred_username do JWT Keycloak, ou fallback para auth.getName(). */
    private String extractUsername(Authentication auth)
    {
        if (auth == null) return "anonymous";
        if (auth.getPrincipal() instanceof Jwt jwt)
        {
            String preferred = jwt.getClaimAsString("preferred_username");
            if (preferred != null && !preferred.isBlank()) return preferred;
        }
        return auth.getName();
    }

    // ─── Importações ────────────────────────────────────────

    @GetMapping("/imports")
    public ResponseEntity<List<GtfsImportDTO>> listImports()
    {
        return ResponseEntity.ok(gtfsService.listImports());
    }

    @GetMapping("/imports/{id}")
    public ResponseEntity<GtfsImportDTO> getImport(@PathVariable Long id)
    {
        return ResponseEntity.ok(gtfsService.getImport(id));
    }

    /** Upload de ficheiro ZIP GTFS. */
    @PostMapping("/upload")
    @LogActivity(action = "Upload GTFS")
    public ResponseEntity<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            Authentication auth)
    {
        try
        {
            String username = extractUsername(auth);
            String filename = file.getOriginalFilename();
            log.info("[GTFS] Upload recebido: {} ({} KB) por {}",
                    filename, file.getSize() / 1024, username);

            gtfsService.processUpload(file.getBytes(), filename, username);

            return ResponseEntity.accepted().body(Map.of(
                    "message", "Importação iniciada",
                    "filename", filename != null ? filename : "unknown"
            ));
        }
        catch (Exception e)
        {
            log.error("[GTFS] Erro no upload: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** Preview de ZIP sem importar. */
    @PostMapping("/preview")
    public ResponseEntity<Map<String, Object>> preview(@RequestParam("file") MultipartFile file)
    {
        try
        {
            Map<String, Object> result = gtfsService.previewZip(file.getBytes());
            return ResponseEntity.ok(result);
        }
        catch (Exception e)
        {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** Download on-demand dos TUB. */
    @PostMapping("/sync-tub")
    @LogActivity(action = "Sincronizar GTFS TUB")
    public ResponseEntity<Map<String, String>> syncTub(Authentication auth)
    {
        String username = extractUsername(auth);
        log.info("[GTFS] Sincronização TUB manual por {}", username);
        gtfsService.processTubDownload("TUB_MANUAL", username);
        return ResponseEntity.accepted().body(Map.of("message", "Sincronização TUB iniciada"));
    }

    /** Reverter uma importação. */
    @PostMapping("/imports/{id}/revert")
    @LogActivity(action = "Reverter importação GTFS")
    public ResponseEntity<?> revertImport(@PathVariable Long id)
    {
        try
        {
            GtfsImportDTO result = gtfsService.revertImport(id);
            return ResponseEntity.ok(result);
        }
        catch (RuntimeException e)
        {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ─── Horários (stop_schedule) ─────────────────────────────

    /** Horários de uma paragem (todas as rotas). */
    @GetMapping("/schedules/stop/{stopId}")
    public ResponseEntity<List<StopScheduleDTO>> getSchedulesByStop(@PathVariable Long stopId)
    {
        return ResponseEntity.ok(gtfsService.getSchedulesByStop(stopId));
    }

    /** Horários de uma paragem numa rota específica. */
    @GetMapping("/schedules/stop/{stopId}/route/{routeId}")
    public ResponseEntity<List<StopScheduleDTO>> getSchedulesByStopAndRoute(
            @PathVariable Long stopId, @PathVariable Long routeId)
    {
        return ResponseEntity.ok(gtfsService.getSchedulesByStopAndRoute(stopId, routeId));
    }

    /** Tabela de horários completa de uma rota. */
    @GetMapping("/schedules/route/{routeId}")
    public ResponseEntity<List<StopScheduleDTO>> getSchedulesByRoute(@PathVariable Long routeId)
    {
        return ResponseEntity.ok(gtfsService.getSchedulesByRoute(routeId));
    }

    // ─── Configuração de Agendamento ────────────────────────

    @GetMapping("/config")
    public ResponseEntity<GtfsConfigDTO> getConfig()
    {
        return ResponseEntity.ok(gtfsService.getConfig());
    }

    @PutMapping("/config")
    @LogActivity(action = "Atualizar config GTFS")
    public ResponseEntity<GtfsConfigDTO> updateConfig(@RequestBody GtfsConfigDTO dto, Authentication auth)
    {
        String username = extractUsername(auth);
        return ResponseEntity.ok(gtfsService.updateConfig(dto, username));
    }
}
