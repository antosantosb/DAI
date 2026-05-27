package dai.tub.pgu.controller;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.domain.DataSource;
import dai.tub.pgu.domain.GlobalConfig;
import dai.tub.pgu.dto.DataSourceDTO;
import dai.tub.pgu.repository.DataSourcePulseRepository;
import dai.tub.pgu.repository.DataSourceRepository;
import dai.tub.pgu.repository.GlobalConfigRepository;
import dai.tub.pgu.service.DataSourceHealthService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Sprint 0 (F4): CRUD e pulses das DataSources (R.ID.01-09).
 *
 * <p>Endpoints publicos:
 * <ul>
 *   <li>{@code GET /api/v1/data-sources}: lista todas.</li>
 *   <li>{@code GET /api/v1/data-sources/{id}}: detalhe.</li>
 *   <li>{@code POST /api/v1/data-sources}: criar (admin).</li>
 *   <li>{@code PUT /api/v1/data-sources/{id}}: atualizar (admin).</li>
 *   <li>{@code DELETE /api/v1/data-sources/{id}}: remover (admin).</li>
 *   <li>{@code POST /api/v1/data-sources/{id}/pulse}: receber pulse (interno,
 *       protegido por API key via InternalApiKeyFilter).</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/data-sources")
@RequiredArgsConstructor
public class DataSourceController {

    private final DataSourceRepository repo;
    private final DataSourceHealthService health;
    // Sprint 0 (F4 follow-up): owner default vem do GlobalConfig (editado pela
    // pagina Parametros). Aplicado como fallback quando a fonte nao tem
    // owner/contacto proprios.
    private final GlobalConfigRepository globalConfigRepo;
    private final DataSourcePulseRepository pulseRepo;

    @GetMapping
    public List<DataSourceDTO> list() {
        GlobalConfig cfg = globalConfigRepo.findAll().stream().findFirst().orElse(null);
        return repo.findAll().stream()
                .map(DataSourceDTO::from)
                .map(dto -> applyOwnerFallback(dto, cfg))
                .toList();
    }

    @GetMapping("/{id}")
    public DataSourceDTO get(@PathVariable Long id) {
        DataSource ds = repo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("DataSource " + id + " nao encontrada"));
        GlobalConfig cfg = globalConfigRepo.findAll().stream().findFirst().orElse(null);
        return applyOwnerFallback(DataSourceDTO.from(ds), cfg);
    }

    private static DataSourceDTO applyOwnerFallback(DataSourceDTO dto, GlobalConfig cfg) {
        if (cfg == null) return dto;
        if (dto.getOwner() == null || dto.getOwner().isBlank()) {
            dto.setOwner(cfg.getDefaultOwnerName());
        }
        if (dto.getContactoEmail() == null || dto.getContactoEmail().isBlank()) {
            dto.setContactoEmail(cfg.getDefaultOwnerEmail());
        }
        return dto;
    }

    @PostMapping
    @LogActivity(action = "Criar fonte de dados")
    public ResponseEntity<DataSourceDTO> create(@RequestBody DataSourceDTO dto) {
        DataSource ds = new DataSource();
        applyDto(ds, dto);
        DataSource saved = repo.save(ds);
        return ResponseEntity.status(HttpStatus.CREATED).body(DataSourceDTO.from(saved));
    }

    @PutMapping("/{id}")
    @LogActivity(action = "Atualizar fonte de dados")
    public DataSourceDTO update(@PathVariable Long id, @RequestBody DataSourceDTO dto) {
        DataSource ds = repo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("DataSource " + id + " nao encontrada"));
        applyDto(ds, dto);
        return DataSourceDTO.from(repo.save(ds));
    }

    @DeleteMapping("/{id}")
    @LogActivity(action = "Remover fonte de dados")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Pulse endpoint. Chamado pelos componentes externos (simulador, NiFi, ...)
     * via {@code POST /api/v1/data-sources/{id}/pulse} com o cabeçalho
     * {@code X-Internal-API-Key: <PGU_INTERNAL_API_KEY>}.
     *
     * <p>Body opcional: {@code { "detalhes": "string livre" }}.
     */
    @PostMapping("/{id}/pulse")
    public DataSourceDTO pulse(@PathVariable Long id,
                                @RequestBody(required = false) Map<String, Object> body) {
        String detalhes = body == null ? null : (String) body.get("detalhes");
        return DataSourceDTO.from(health.recordPulse(id, detalhes));
    }

    /**
     * Sprint 0 (F4 follow-up): timeline de probes para o chart na pagina Fontes.
     * Devolve buckets de tempo com a percentagem de respostas OK por fonte.
     *
     * <p>Query params:
     * <ul>
     *   <li>{@code range}: "1h" (default), "6h", "24h", "7d"</li>
     *   <li>{@code dataSourceId} (opcional): se presente, filtra a uma fonte</li>
     * </ul>
     *
     * <p>Cada linha do resultado:
     * <code>{ts, dataSourceId, dataSourceName, total, healthy, okPct}</code>
     */
    @GetMapping("/timeline")
    public List<Map<String, Object>> timeline(
            @RequestParam(required = false, defaultValue = "1h") String range,
            @RequestParam(required = false) Long dataSourceId
    ) {
        Duration window = parseRange(range);
        long bucketSeconds = chooseBucketSeconds(window);
        OffsetDateTime until = OffsetDateTime.now();
        OffsetDateTime since = until.minus(window);

        List<Object[]> rows = pulseRepo.findTimeline(since, until, bucketSeconds, dataSourceId);
        List<Map<String, Object>> out = new java.util.ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ts", r[2] == null ? null : r[2].toString());
            m.put("dataSourceId", r[0]);
            m.put("dataSourceName", r[1]);
            m.put("total", r[3]);
            m.put("healthy", r[4]);
            m.put("okPct", r[5]);
            out.add(m);
        }
        return out;
    }

    private static Duration parseRange(String range) {
        return switch (range == null ? "1h" : range.toLowerCase()) {
            case "6h"  -> Duration.ofHours(6);
            case "24h" -> Duration.ofHours(24);
            case "7d"  -> Duration.ofDays(7);
            default    -> Duration.ofHours(1);
        };
    }

    private static long chooseBucketSeconds(Duration window) {
        long hours = window.toHours();
        if (hours <= 1)  return 60;       // 1h -> 60s buckets (60 pontos)
        if (hours <= 6)  return 300;      // 6h -> 5min buckets (72 pontos)
        if (hours <= 24) return 1800;     // 24h -> 30min buckets (48 pontos)
        return 14400;                     // 7d -> 4h buckets (42 pontos)
    }

    /**
     * Sprint 0 (F4 follow-up): user-iniciado report de problema. Envia email
     * para o contacto da fonte (ou owner default do GlobalConfig).
     *
     * <p>Body opcional: {@code { "mensagem": "..." }}.
     */
    @PostMapping("/{id}/report")
    @LogActivity(action = "Reportar problema na fonte de dados")
    public ResponseEntity<Map<String, Object>> reportIssue(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal Jwt jwt) {
        DataSource ds = repo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("DataSource " + id + " nao encontrada"));
        GlobalConfig cfg = globalConfigRepo.findAll().stream().findFirst().orElse(null);

        // Resolver destinatario: contacto proprio da fonte, com fallback para o global
        String destinatario = ds.getContactoEmail();
        if (destinatario == null || destinatario.isBlank()) {
            destinatario = cfg != null ? cfg.getDefaultOwnerEmail() : null;
        }

        String mensagem = body == null ? null : (String) body.get("mensagem");
        String reportedBy = jwt != null ? jwt.getClaimAsString("preferred_username") : "anonimo";

        health.reportIssueByEmail(ds, destinatario, reportedBy, mensagem);
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "destinatario", destinatario
        ));
    }

    private static void applyDto(DataSource ds, DataSourceDTO dto) {
        if (dto.getNome() != null)             ds.setNome(dto.getNome());
        if (dto.getTipo() != null)             ds.setTipo(dto.getTipo());
        if (dto.getDescricao() != null)        ds.setDescricao(dto.getDescricao());
        if (dto.getOwner() != null)            ds.setOwner(dto.getOwner());
        if (dto.getContactoEmail() != null)    ds.setContactoEmail(dto.getContactoEmail());
        if (dto.getContactoTelefone() != null) ds.setContactoTelefone(dto.getContactoTelefone());
        if (dto.getStatus() != null)           ds.setStatus(dto.getStatus());
        ds.setEnabled(dto.isEnabled());
        if (dto.getPulseIntervalSeconds() > 0)     ds.setPulseIntervalSeconds(dto.getPulseIntervalSeconds());
        if (dto.getDegradedThresholdSeconds() > 0) ds.setDegradedThresholdSeconds(dto.getDegradedThresholdSeconds());
        if (dto.getDownThresholdSeconds() > 0)     ds.setDownThresholdSeconds(dto.getDownThresholdSeconds());
    }
}
