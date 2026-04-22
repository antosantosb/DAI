package dai.tub.pgu.controller;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.domain.ExportJob;
import dai.tub.pgu.dto.ExportJobDTO;
import dai.tub.pgu.dto.ExportRequestDTO;
import dai.tub.pgu.service.ExportService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.util.List;
import java.util.UUID;

/**
 * Motor de Exportação Massiva (Backoffice).
 *
 * - GET  /api/v1/exports             → lista todos os jobs
 * - POST /api/v1/exports/telemetry  → submete job e devolve imediatamente
 * - GET  /api/v1/exports/{uuid}     → consulta estado
 * - GET  /api/v1/exports/{uuid}/download → descarrega ficheiro quando pronto
 *
 * O Frontend subscreve /topic/exports (e opcionalmente /topic/exports/{user})
 * via STOMP para ser avisado quando o ficheiro estiver pronto.
 */
@RestController
@RequestMapping("/api/v1/exports")
public class ExportController
{
    private final ExportService exportService;

    public ExportController(ExportService exportService)
    {
        this.exportService = exportService;
    }

    @GetMapping
    public List<ExportJobDTO> list()
    {
        return exportService.listAll();
    }

    @PostMapping("/telemetry")
    @LogActivity(action = "Submeter exportação")
    public ResponseEntity<ExportJobDTO> submit(@RequestBody ExportRequestDTO req,
                                               @AuthenticationPrincipal Jwt jwt)
    {
        if (req.getFormat() == null)
            return ResponseEntity.badRequest().build();

        // Extrair username do JWT (mais seguro do que confiar no frontend)
        String username = jwt.getClaimAsString("preferred_username");
        if (username != null) req.setRequestedBy(username);

        ExportJob job = exportService.submit(req);
        // 202 Accepted — o trabalho está em processamento
        return ResponseEntity
            .accepted()
            .body(ExportJobDTO.fromEntity(job));
    }

    @GetMapping("/{uuid}")
    public ResponseEntity<ExportJobDTO> status(@PathVariable UUID uuid)
    {
        ExportJob job = exportService.getByUuid(uuid);
        return ResponseEntity.ok(ExportJobDTO.fromEntity(job));
    }

    @DeleteMapping("/{uuid}")
    @LogActivity(action = "Eliminar exportação")
    public ResponseEntity<Void> delete(@PathVariable UUID uuid)
    {
        try
        {
            exportService.deleteJob(uuid);
            return ResponseEntity.noContent().build();
        }
        catch (IllegalArgumentException ex)
        {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{uuid}/download")
    public ResponseEntity<Resource> download(@PathVariable UUID uuid)
    {
        ExportJob job = exportService.getByUuid(uuid);

        if (job.getStatus() != ExportJob.Status.COMPLETED || job.getFilePath() == null)
            return ResponseEntity.status(409).build(); // Conflict: ainda não pronto

        File file = new File(job.getFilePath());
        if (!file.exists()) return ResponseEntity.notFound().build();

        MediaType mime = job.getFormat() == ExportJob.Format.CSV
                       ? MediaType.parseMediaType("text/csv")
                       : MediaType.APPLICATION_PDF;

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"" + job.getFileName() + "\"")
            .contentType(mime)
            .contentLength(file.length())
            .body(new FileSystemResource(file));
    }
}
