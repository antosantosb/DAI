package dai.tub.pgu.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import dai.tub.pgu.dto.EnviarMensagemRequest;
import dai.tub.pgu.dto.MensagemDespachoDTO;
import dai.tub.pgu.service.DespachoService;

@RestController
@RequestMapping("/api/v1/despacho")
public class DespachoController {

    private final DespachoService despachoService;

    public DespachoController(DespachoService despachoService) {
        this.despachoService = despachoService;
    }

    @PostMapping("/{busId}/mensagens")
    public ResponseEntity<MensagemDespachoDTO> enviar(
            @PathVariable String busId,
            @Valid @RequestBody EnviarMensagemRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String operador = resolveUsername(jwt);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(despachoService.enviarMensagem(busId, request, operador));
    }

    @GetMapping("/{busId}/mensagens")
    public ResponseEntity<List<MensagemDespachoDTO>> listar(@PathVariable String busId) {
        return ResponseEntity.ok(despachoService.listarMensagens(busId));
    }

    /**
     * Devolve mapa busId → contagem de mensagens não lidas do motorista para todos os autocarros.
     * Usado pelo backoffice para mostrar badges nos cards.
     */
    @GetMapping("/unread-counts")
    public ResponseEntity<Map<String, Long>> unreadCounts() {
        return ResponseEntity.ok(despachoService.getUnreadCountsByBus());
    }

    /**
     * Marca todas as mensagens do motorista como lidas pelo operador.
     * Chamado quando o operador abre o chat de um autocarro.
     */
    @PostMapping("/{busId}/mensagens/marcar-lidas")
    public ResponseEntity<Map<String, Integer>> marcarLidas(@PathVariable String busId) {
        int marked = despachoService.marcarMensagensComoLidas(busId);
        return ResponseEntity.ok(Map.of("marked", marked));
    }

    @PostMapping("/{busId}/mensagens/{id}/reenviar")
    public ResponseEntity<MensagemDespachoDTO> reenviar(
            @PathVariable String busId,
            @PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt) {
        String operador = resolveUsername(jwt);
        return ResponseEntity.ok(despachoService.reenviarMensagem(id, operador));
    }

    @DeleteMapping("/{busId}/mensagens/{id}")
    public ResponseEntity<Void> cancelar(
            @PathVariable String busId,
            @PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt) {
        String operador = resolveUsername(jwt);
        despachoService.cancelarMensagem(id, operador);
        return ResponseEntity.noContent().build();
    }

    /**
     * Motorista envia mensagem ao despacho a partir do painel de bordo.
     * Reutiliza o mesmo sistema — a mensagem fica associada ao busId com remetente = motorista.
     */
    @PostMapping("/{busId}/mensagens/motorista")
    public ResponseEntity<MensagemDespachoDTO> enviarDoMotorista(
            @PathVariable String busId,
            @Valid @RequestBody EnviarMensagemRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String motorista = "motorista:" + resolveUsername(jwt);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(despachoService.enviarMensagem(busId, request, motorista));
    }

    @GetMapping("/{busId}/online")
    public ResponseEntity<Map<String, Boolean>> isOnline(@PathVariable String busId) {
        boolean online = despachoService.isBusOnline(busId);
        Map<String, Boolean> res = new HashMap<>();
        res.put("online", online);
        return ResponseEntity.ok(res);
    }

    @PostMapping("/{busId}/ack")
    public ResponseEntity<Map<String, Object>> webhookAck(
            @PathVariable String busId,
            @RequestBody Map<String, String> payload) {
        String messageId = payload.get("messageId");
        String type = payload.get("type");
        
        if (messageId == null || type == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Campos messageId e type são obrigatórios no payload de ACK.");
            return ResponseEntity.badRequest().body(error);
        }

        despachoService.processarAck(busId, messageId, type);
        
        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        return ResponseEntity.ok(res);
    }

    private String resolveUsername(Jwt jwt) {
        if (jwt == null) return "sistema";
        String name = jwt.getClaimAsString("preferred_username");
        return name != null ? name : jwt.getSubject();
    }
}
