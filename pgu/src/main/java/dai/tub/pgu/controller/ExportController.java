package dai.tub.pgu.controller;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.domain.ExportJob;
import dai.tub.pgu.dto.ExportJobDTO;
import dai.tub.pgu.dto.ExportRequestDTO;
import dai.tub.pgu.service.ExportService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;
import java.util.Map;
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

    /**
     * F9: lista jobs filtrada por owner.
     *
     * Regras:
     * - Operador (não-admin): vê apenas os seus jobs. {@code owner} é ignorado.
     * - Admin: vê os seus por default; pode passar {@code owner=all} para ver
     *   tudo, ou {@code owner=<username>} para ver os de outro.
     */
    @GetMapping
    public List<ExportJobDTO> list(@RequestParam(required = false) String type,
                                   @RequestParam(required = false) String owner,
                                   @AuthenticationPrincipal Jwt jwt)
    {
        String me = jwt != null ? jwt.getClaimAsString("preferred_username") : null;
        boolean isAdmin = jwt != null
            && jwt.getClaimAsStringList("realm_access.roles") != null
            && jwt.getClaimAsStringList("realm_access.roles").contains("admin");

        // Fallback robusto: ler roles via mapa aninhado (Keycloak típico)
        if (!isAdmin && jwt != null)
        {
            Object realmAccess = jwt.getClaim("realm_access");
            if (realmAccess instanceof java.util.Map<?,?> ra)
            {
                Object roles = ra.get("roles");
                if (roles instanceof java.util.Collection<?> col && col.contains("admin"))
                    isAdmin = true;
            }
        }

        // Resolve filtro de owner com base no papel
        String ownerFilter;
        if (isAdmin)
        {
            // Admin: default = ver tudo (UI mostra "Todos" por defeito).
            // Aceita "all" (ver tudo), "me" (só meus) ou username explícito.
            if (owner == null || "all".equalsIgnoreCase(owner))      ownerFilter = null;
            else if ("me".equalsIgnoreCase(owner))                   ownerFilter = me;
            else                                                     ownerFilter = owner;
        }
        else
        {
            // Operador/motorista: força filtro por si mesmo, ignora qualquer override.
            ownerFilter = me;
        }

        if (type != null) {
            try {
                ExportJob.DataType dt = ExportJob.DataType.valueOf(type.toUpperCase());
                return exportService.listByTypeForUser(dt, ownerFilter);
            } catch (IllegalArgumentException ignored) {}
        }
        return exportService.listAllForUser(ownerFilter);
    }

    @PostMapping("/telemetry")
    @LogActivity(action = "Submeter exportação de telemetria")
    public ResponseEntity<ExportJobDTO> submitTelemetry(@RequestBody ExportRequestDTO req,
                                                        @AuthenticationPrincipal Jwt jwt)
    {
        if (req.getFormat() == null)
            return ResponseEntity.badRequest().build();

        String username = jwt.getClaimAsString("preferred_username");
        if (username != null) req.setRequestedBy(username);
        req.setDataType(ExportJob.DataType.TELEMETRY);

        ExportJob job = exportService.submit(req);
        return ResponseEntity.accepted().body(ExportJobDTO.fromEntity(job));
    }

    @PostMapping("/logs")
    @LogActivity(action = "Submeter exportação de logs")
    public ResponseEntity<ExportJobDTO> submitLogs(@RequestBody ExportRequestDTO req,
                                                    @AuthenticationPrincipal Jwt jwt)
    {
        if (req.getFormat() == null)
            return ResponseEntity.badRequest().build();

        String username = jwt.getClaimAsString("preferred_username");
        if (username != null) req.setRequestedBy(username);
        req.setDataType(ExportJob.DataType.AUDIT_LOG);

        ExportJob job = exportService.submit(req);
        return ResponseEntity.accepted().body(ExportJobDTO.fromEntity(job));
    }

    @GetMapping("/{uuid}")
    public ResponseEntity<ExportJobDTO> status(@PathVariable UUID uuid)
    {
        ExportJob job = exportService.getByUuid(uuid);
        return ResponseEntity.ok(ExportJobDTO.fromEntity(job));
    }

    /**
     * F9: Cancela um job em curso (PENDING ou PROCESSING).
     * Devolve 200 se foi marcado, 409 se já estava em estado terminal.
     */
    @PostMapping("/{uuid}/cancel")
    @LogActivity(action = "Cancelar exportação")
    public ResponseEntity<ExportJobDTO> cancel(@PathVariable UUID uuid)
    {
        try
        {
            boolean cancelled = exportService.cancelJob(uuid);
            ExportJob job = exportService.getByUuid(uuid);
            if (!cancelled)
                return ResponseEntity.status(409).body(ExportJobDTO.fromEntity(job));
            return ResponseEntity.ok(ExportJobDTO.fromEntity(job));
        }
        catch (IllegalArgumentException ex)
        {
            return ResponseEntity.notFound().build();
        }
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

    /**
     * F9 (MinIO migration): devolve uma presigned URL fresca para download.
     *
     * <p>Cada clique no botao "Descarregar" do frontend faz GET a este endpoint
     * e recebe uma URL com assinatura curta (TTL configurado em
     * {@code pgu.export.presigned-ttl-seconds}, default 1h) que aponta
     * diretamente para o MinIO publico. O browser usa essa URL para descarregar
     * sem passar bytes pelo backend.
     *
     * <p>Vantagens: presigned URLs nao sao cachaveis (a assinatura caduca) e a
     * gestao de credenciais MinIO fica encapsulada no backend.
     */
    @GetMapping("/{uuid}/download-url")
    public ResponseEntity<Map<String, Object>> downloadUrl(@PathVariable UUID uuid)
    {
        try
        {
            ExportJob job = exportService.getByUuid(uuid);
            if (job.getStatus() != ExportJob.Status.COMPLETED)
                return ResponseEntity.status(409).build(); // Conflict: ainda nao pronto

            String url = exportService.presignedDownloadUrl(uuid);
            if (url == null) return ResponseEntity.status(409).build();

            return ResponseEntity.ok(Map.of(
                "url",      url,
                "fileName", job.getFileName() != null ? job.getFileName() : "export",
                "fileSize", job.getFileSize() != null ? job.getFileSize() : 0L
            ));
        }
        catch (IllegalArgumentException ex)
        {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * F9 (compat): mantem o endpoint legacy {@code /download} como 302 redirect
     * para a presigned URL. Assim utilizadores que tenham o link antigo (ex:
     * via email/bookmark) continuam a funcionar. O frontend novo prefere o
     * endpoint {@link #downloadUrl(UUID)} acima.
     */
    @GetMapping("/{uuid}/download")
    public ResponseEntity<Void> download(@PathVariable UUID uuid)
    {
        try
        {
            ExportJob job = exportService.getByUuid(uuid);
            if (job.getStatus() != ExportJob.Status.COMPLETED)
                return ResponseEntity.status(409).build();

            String url = exportService.presignedDownloadUrl(uuid);
            if (url == null) return ResponseEntity.notFound().build();

            return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(url))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .build();
        }
        catch (IllegalArgumentException ex)
        {
            return ResponseEntity.notFound().build();
        }
    }
}
