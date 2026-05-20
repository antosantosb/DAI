package dai.tub.pgu.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.HashMap;

import dai.tub.pgu.domain.EstadoOcorrencia;
import dai.tub.pgu.domain.Ocorrencia;
import dai.tub.pgu.domain.OcorrenciaAnexo;
import dai.tub.pgu.dto.OcorrenciaDTO;
import dai.tub.pgu.dto.OcorrenciaRequestDTO;
import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.service.AnexoService;
import dai.tub.pgu.service.OcorrenciaService;
import dai.tub.pgu.service.TelemetryService;
import dai.tub.pgu.repository.OcorrenciaRepository;

@RestController
@RequestMapping("/api/v1/ocorrencias")
public class OcorrenciaController {

    private final OcorrenciaService ocorrenciaService;
    private final AnexoService anexoService;
    private final TelemetryService telemetryService;
    private final OcorrenciaRepository ocorrenciaRepository;

    public OcorrenciaController(OcorrenciaService ocorrenciaService,
                                AnexoService anexoService,
                                TelemetryService telemetryService,
                                OcorrenciaRepository ocorrenciaRepository) {
        this.ocorrenciaService = ocorrenciaService;
        this.anexoService = anexoService;
        this.telemetryService = telemetryService;
        this.ocorrenciaRepository = ocorrenciaRepository;
    }

    @GetMapping
    public ResponseEntity<List<OcorrenciaDTO>> list(
            @RequestParam(required = false) EstadoOcorrencia estado,
            @RequestParam(required = false) String ativoId) {
        return ResponseEntity.ok(ocorrenciaService.listarOcorrencias(estado, ativoId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<OcorrenciaDTO> getById(@PathVariable Long id) {
        return ResponseEntity.ok(ocorrenciaService.getById(id));
    }

    @PostMapping
    public ResponseEntity<OcorrenciaDTO> create(
            @RequestBody OcorrenciaRequestDTO.RegistarOcorrenciaRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String username = resolveUsername(jwt);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ocorrenciaService.criarOcorrencia(request, username));
    }

    @PostMapping("/{id}/assumir")
    public ResponseEntity<OcorrenciaDTO> assume(
            @PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt) {
        String username = resolveUsername(jwt);
        return ResponseEntity.ok(ocorrenciaService.assumirOcorrencia(id, username));
    }

    @PostMapping("/{id}/acao-corretiva")
    public ResponseEntity<OcorrenciaDTO> registerCorrectiveAction(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal Jwt jwt) {
        String username = resolveUsername(jwt);
        String acao = body.get("acaoCorretiva");
        if (acao == null || acao.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O campo acaoCorretiva é obrigatório.");
        }
        return ResponseEntity.ok(ocorrenciaService.registarAcaoCorretiva(id, acao, username));
    }

    @PostMapping("/{id}/fechar")
    public ResponseEntity<OcorrenciaDTO> close(
            @PathVariable Long id,
            @RequestBody OcorrenciaRequestDTO.FecharOcorrenciaRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String username = resolveUsername(jwt);
        return ResponseEntity.ok(ocorrenciaService.fecharOcorrencia(id, request, username));
    }

    @PostMapping("/{id}/falso-positivo")
    public ResponseEntity<OcorrenciaDTO> markFalsePositive(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal Jwt jwt) {
        String username = resolveUsername(jwt);
        String justificacao = body.get("justificacao");
        if (justificacao == null || justificacao.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O campo justificacao é obrigatório.");
        }
        return ResponseEntity.ok(ocorrenciaService.marcarFalsoPositivo(id, justificacao, username));
    }

    @PostMapping(value = "/{id}/anexos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> uploadAttachment(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal Jwt jwt) {
        String username = resolveUsername(jwt);
        Ocorrencia o = ocorrenciaRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ocorrência não encontrada."));

        OcorrenciaAnexo anexo = anexoService.salvarAnexo(o, file, username);

        Map<String, Object> response = new HashMap<>();
        response.put("id", anexo.getId());
        response.put("nomeFicheiro", anexo.getNomeFicheiro());
        response.put("tamanhoBytes", anexo.getTamanhoBytes());
        response.put("mimeType", anexo.getMimeType());
        response.put("uploadPor", anexo.getUploadPor());
        response.put("uploadEm", anexo.getUploadEm());

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{id}/anexos")
    public ResponseEntity<List<Map<String, Object>>> listAttachments(@PathVariable Long id) {
        List<OcorrenciaAnexo> anexos = anexoService.listarAnexos(id);
        List<Map<String, Object>> response = anexos.stream().map(anexo -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", anexo.getId());
            map.put("nomeFicheiro", anexo.getNomeFicheiro());
            map.put("tamanhoBytes", anexo.getTamanhoBytes());
            map.put("mimeType", anexo.getMimeType());
            map.put("uploadPor", anexo.getUploadPor());
            map.put("uploadEm", anexo.getUploadEm());
            return map;
        }).toList();

        return ResponseEntity.ok(response);
    }

    @GetMapping("/ativos/{ativoId}/telemetria")
    public ResponseEntity<List<TelemetryDTO>> getTelemetry24h(@PathVariable String ativoId) {
        return ResponseEntity.ok(telemetryService.get24hTelemetry(ativoId));
    }

    private String resolveUsername(Jwt jwt) {
        if (jwt == null) return "sistema";
        String name = jwt.getClaimAsString("preferred_username");
        return name != null ? name : jwt.getSubject();
    }
}
