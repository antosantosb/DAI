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

import dai.tub.pgu.domain.BusStop;
import dai.tub.pgu.domain.EstadoOcorrencia;
import dai.tub.pgu.domain.Ocorrencia;
import dai.tub.pgu.domain.OcorrenciaAnexo;
import dai.tub.pgu.dto.OcorrenciaDTO;
import dai.tub.pgu.dto.OcorrenciaLocationContextDTO;
import dai.tub.pgu.dto.OcorrenciaRequestDTO;
import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.service.AnexoService;
import dai.tub.pgu.service.OcorrenciaService;
import dai.tub.pgu.service.TelemetryService;
import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.repository.BusStopRepository;
import dai.tub.pgu.repository.OcorrenciaRepository;
import dai.tub.pgu.repository.TelemetryRepository;

@RestController
@RequestMapping("/api/v1/ocorrencias")
public class OcorrenciaController {

    private final OcorrenciaService ocorrenciaService;
    private final AnexoService anexoService;
    private final TelemetryService telemetryService;
    private final OcorrenciaRepository ocorrenciaRepository;
    private final BusStopRepository busStopRepository;
    private final TelemetryRepository telemetryRepository;

    public OcorrenciaController(OcorrenciaService ocorrenciaService,
                                AnexoService anexoService,
                                TelemetryService telemetryService,
                                OcorrenciaRepository ocorrenciaRepository,
                                BusStopRepository busStopRepository,
                                TelemetryRepository telemetryRepository) {
        this.ocorrenciaService = ocorrenciaService;
        this.anexoService = anexoService;
        this.telemetryService = telemetryService;
        this.ocorrenciaRepository = ocorrenciaRepository;
        this.busStopRepository = busStopRepository;
        this.telemetryRepository = telemetryRepository;
    }

    /**
     * Sprint 5 (follow-up): contexto geografico de uma ocorrencia — para o
     * fiscal se orientar ate ao local. Devolve a ultima localizacao conhecida
     * do bus + a paragem mais proxima (haversine sobre todas as stops).
     */
    @GetMapping("/{id}/location-context")
    public ResponseEntity<OcorrenciaLocationContextDTO> getLocationContext(@PathVariable Long id)
    {
        Ocorrencia oc = ocorrenciaRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ocorrencia nao encontrada"));

        OcorrenciaLocationContextDTO dto = new OcorrenciaLocationContextDTO();
        dto.setOcorrenciaId(oc.getId());
        dto.setAtivoId(oc.getAtivoId());

        VehicleTelemetry latest = telemetryRepository.findLatestByBusId(oc.getAtivoId());
        if (latest == null || latest.getLocation() == null) {
            return ResponseEntity.ok(dto);
        }
        double busLat = latest.getLocation().getY();
        double busLon = latest.getLocation().getX();
        dto.setBusLat(busLat);
        dto.setBusLon(busLon);

        // Single pass: encontrar a paragem mais proxima do bus + a paragem
        // destino actual (cujo nome esta' em latest.getNextStop(), populado
        // pelo TelemetryService.deriveNextStop). Se o nome coincide com
        // varias stops, escolhemos a mais proxima do bus para desambiguar.
        String destName = latest.getNextStop();
        BusStop nearest = null;
        double bestDist = Double.MAX_VALUE;
        BusStop dest = null;
        double bestDestDist = Double.MAX_VALUE;
        for (BusStop s : busStopRepository.findAll()) {
            if (s.getLocation() == null) continue;
            double sLat = s.getLocation().getY();
            double sLon = s.getLocation().getX();
            double d = haversineMeters(busLat, busLon, sLat, sLon);
            if (d < bestDist) { bestDist = d; nearest = s; }
            if (destName != null && !destName.isBlank()
                && destName.equalsIgnoreCase(s.getName())
                && d < bestDestDist) {
                bestDestDist = d; dest = s;
            }
        }
        if (nearest != null) {
            dto.setNearestStopId(nearest.getId());
            dto.setNearestStopName(nearest.getName());
            dto.setNearestStopCode(nearest.getCode());
            dto.setNearestStopLat(nearest.getLocation().getY());
            dto.setNearestStopLon(nearest.getLocation().getX());
            dto.setNearestStopDistanceMeters((int) Math.round(bestDist));
        }
        if (dest != null) {
            dto.setDestStopId(dest.getId());
            dto.setDestStopName(dest.getName());
            dto.setDestStopCode(dest.getCode());
            dto.setDestStopLat(dest.getLocation().getY());
            dto.setDestStopLon(dest.getLocation().getX());
            dto.setDestStopDistanceMeters((int) Math.round(bestDestDist));
        }
        return ResponseEntity.ok(dto);
    }

    private static double haversineMeters(double lat1, double lon1, double lat2, double lon2)
    {
        double R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

    @PostMapping("/{id}/atribuir")
    public ResponseEntity<OcorrenciaDTO> reassign(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal Jwt jwt) {
        String username = resolveUsername(jwt);
        String responsavel = body.get("responsavel");
        if (responsavel == null || responsavel.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O campo responsavel é obrigatório.");
        }
        return ResponseEntity.ok(ocorrenciaService.atribuirOcorrencia(id, responsavel, username));
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

    /**
     * Endpoint simplificado para motoristas reportarem alertas (avaria ou acidente).
     * Preenche automaticamente tipoAtivo=BUS e prioridade conforme o tipo.
     */
    @PostMapping("/motorista")
    public ResponseEntity<OcorrenciaDTO> createFromDriver(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal Jwt jwt) {
        String username = "motorista:" + resolveUsername(jwt);
        String tipo = body.getOrDefault("tipo", "AVARIA"); // AVARIA | ACIDENTE
        String busCode = body.get("busCode");
        String descricao = body.getOrDefault("descricao", "");

        if (busCode == null || busCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "busCode é obrigatório.");
        }

        OcorrenciaRequestDTO.RegistarOcorrenciaRequest request = new OcorrenciaRequestDTO.RegistarOcorrenciaRequest();
        request.setAtivoId(busCode);
        request.setTipoAtivo("BUS");
        request.setTipoAnomalia(tipo);
        request.setDescricao(descricao.isBlank() ? tipo + " reportada pelo motorista" : descricao);
        request.setPrioridade("ACIDENTE".equals(tipo) ? "CRITICA" : "NORMAL");
        request.setNotasIniciais("Alerta do painel de bordo");

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ocorrenciaService.criarOcorrencia(request, username));
    }

    private String resolveUsername(Jwt jwt) {
        if (jwt == null) return "sistema";
        String name = jwt.getClaimAsString("preferred_username");
        return name != null ? name : jwt.getSubject();
    }
}
