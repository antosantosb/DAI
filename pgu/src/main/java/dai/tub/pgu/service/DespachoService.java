package dai.tub.pgu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.EstadoMensagem;
import dai.tub.pgu.domain.MensagemDespacho;
import dai.tub.pgu.dto.EnviarMensagemRequest;
import dai.tub.pgu.dto.MensagemDespachoDTO;
import dai.tub.pgu.model.AuditLog;
import dai.tub.pgu.repository.AuditLogRepository;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.MensagemDespachoRepository;

@Service
@Transactional
public class DespachoService {

    private static final Logger log = LoggerFactory.getLogger(DespachoService.class);

    @Value("${pgu.despacho.online-threshold-sec:30}")
    private int onlineThresholdSec;

    @Value("${pgu.despacho.delivery-timeout-sec:10}")
    private int deliveryTimeoutSec;

    private final MensagemDespachoRepository mensagemRepository;
    private final BusRepository busRepository;
    private final MqttDespachoService mqttService;
    private final SimpMessagingTemplate messagingTemplate;
    private final TransactionTemplate transactionTemplate;
    private final AuditLogRepository auditLogRepository;

    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);

    public DespachoService(MensagemDespachoRepository mensagemRepository,
                           BusRepository busRepository,
                           MqttDespachoService mqttService,
                           SimpMessagingTemplate messagingTemplate,
                           TransactionTemplate transactionTemplate,
                           AuditLogRepository auditLogRepository) {
        this.mensagemRepository = mensagemRepository;
        this.busRepository = busRepository;
        this.mqttService = mqttService;
        this.messagingTemplate = messagingTemplate;
        this.transactionTemplate = transactionTemplate;
        this.auditLogRepository = auditLogRepository;
    }

    public boolean isBusOnline(String busId) {
        Optional<Bus> busOpt = busRepository.findByBusCode(busId);
        if (busOpt.isEmpty()) {
            return false;
        }
        Bus bus = busOpt.get();
        if (bus.getLastSync() == null) {
            return false;
        }
        long diff = Duration.between(bus.getLastSync(), Instant.now()).toSeconds();
        return diff < onlineThresholdSec;
    }

    public MensagemDespachoDTO enviarMensagem(String busId, EnviarMensagemRequest request, String operador) {
        log.info("Recebido pedido de despacho de operador {} para autocarro {}: '{}'", operador, busId, request.getConteudo());

        // 1. Validar que o autocarro está online
        if (!isBusOnline(busId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 
                "O autocarro " + busId + " encontra-se offline e não pode receber mensagens operacionais no momento.");
        }

        // 2. Persistir a mensagem com estado ENVIADA
        MensagemDespacho msg = new MensagemDespacho();
        msg.setBusId(busId);
        msg.setConteudo(request.getConteudo());
        msg.setEstado(EstadoMensagem.ENVIADA);
        msg.setOperador(operador);
        msg.setTimestampEnvio(Instant.now());
        // Mensagem do operador é "lida" desde o início (foi ele que escreveu).
        // Mensagem do motorista ('motorista:xxx') fica false até o operador abrir o chat.
        msg.setLidaPeloOperador(!operador.startsWith("motorista:"));

        String mqttMsgId = UUID.randomUUID().toString();
        msg.setMqttMessageId(mqttMsgId);

        MensagemDespacho salva = mensagemRepository.save(msg);
        MensagemDespachoDTO dto = mapToDTO(salva);

        // 3. Publicar no tópico MQTT
        mqttService.publicarMensagem(busId, mqttMsgId, request.getConteudo(), operador);

        // 4. Notificar via WebSocket
        notificarOperador(dto);

        // 5. Agendar verificação de Timeout
        agendarTimeoutVerificacao(salva.getId());

        // 6. Registar Auditoria (MENSAGEM_ENVIADA - truncado a 50 chars)
        String conteudoTruncado = request.getConteudo();
        if (conteudoTruncado != null && conteudoTruncado.length() > 50) {
            conteudoTruncado = conteudoTruncado.substring(0, 50);
        }
        registrarAuditoria(operador, "MENSAGEM_ENVIADA", "enviarMensagem", true, conteudoTruncado);

        return dto;
    }

    public void processarAck(String busId, String mqttMessageId, String tipoAck) {
        log.info("Processamento de ACK '{}' para mensagem MQTT '{}' (Autocarro {})", tipoAck, mqttMessageId, busId);

        Optional<MensagemDespacho> msgOpt = mensagemRepository.findByMqttMessageId(mqttMessageId);
        if (msgOpt.isPresent()) {
            MensagemDespacho msg = msgOpt.get();
            
            // Só atualiza se ainda estiver pendente (ENVIADA ou FALHOU recuperado atrasado)
            if (msg.getEstado() == EstadoMensagem.ENVIADA || msg.getEstado() == EstadoMensagem.FALHOU) {
                if ("DELIVERED".equalsIgnoreCase(tipoAck)) {
                    msg.setEstado(EstadoMensagem.ENTREGUE);
                    msg.setTimestampEntrega(Instant.now());
                    msg.setErroDetalhe(null);

                    MensagemDespacho salva = mensagemRepository.save(msg);
                    notificarOperador(mapToDTO(salva));

                    // Registar Auditoria (MENSAGEM_ENTREGUE)
                    registrarAuditoria(msg.getOperador(), "MENSAGEM_ENTREGUE", "processarAck", true, 
                        msg.getTimestampEntrega() != null ? msg.getTimestampEntrega().toString() : Instant.now().toString());
                    
                    log.info("Mensagem #{} atualizada com sucesso para ENTREGUE", msg.getId());

                } else if ("READ".equalsIgnoreCase(tipoAck)) {
                    msg.setEstado(EstadoMensagem.LIDA);
                    msg.setTimestampLeitura(Instant.now());
                    if (msg.getTimestampEntrega() == null) {
                        msg.setTimestampEntrega(Instant.now()); // Fallback se saltou o delivered
                    }
                    msg.setErroDetalhe(null);
                    
                    MensagemDespacho salva = mensagemRepository.save(msg);
                    notificarOperador(mapToDTO(salva));

                    // Registar Auditoria (MENSAGEM_LIDA)
                    registrarAuditoria(msg.getOperador(), "MENSAGEM_LIDA", "processarAck", true, 
                        msg.getTimestampLeitura() != null ? msg.getTimestampLeitura().toString() : Instant.now().toString());

                    log.info("Mensagem #{} atualizada com sucesso para LIDA", msg.getId());
                }
            }
        } else {
            log.warn("Nenhuma mensagem de despacho encontrada para a chave MQTT: {}", mqttMessageId);
        }
    }

    public List<MensagemDespachoDTO> listarMensagens(String busId) {
        return mensagemRepository.findByBusIdOrderByTimestampEnvioDesc(busId).stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    /**
     * Devolve mapa busId → contagem de mensagens não lidas do motorista.
     * Usado pelo backoffice para mostrar badges nos cards de autocarros.
     */
    public java.util.Map<String, Long> getUnreadCountsByBus() {
        java.util.Map<String, Long> result = new java.util.HashMap<>();
        for (Object[] row : mensagemRepository.countUnreadGroupedByBus()) {
            result.put((String) row[0], (Long) row[1]);
        }
        return result;
    }

    /**
     * Marca todas as mensagens do motorista como lidas pelo operador.
     * Chamado quando o operador abre o painel de chat de um autocarro.
     */
    @org.springframework.transaction.annotation.Transactional
    public int marcarMensagensComoLidas(String busId) {
        int n = mensagemRepository.markAllAsReadByOperator(busId);
        if (n > 0) {
            log.info("Marcadas {} mensagens como lidas pelo operador para o autocarro {}", n, busId);
            // Notificar via WebSocket para que outros operadores vejam o badge desaparecer
            messagingTemplate.convertAndSend("/topic/despacho/unread-update", busId);
        }
        return n;
    }

    public MensagemDespachoDTO reenviarMensagem(Long mensagemId, String operador) {
        log.info("Operador {} solicitou reenvio da mensagem falhada #{}", operador, mensagemId);

        MensagemDespacho msg = mensagemRepository.findById(mensagemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Mensagem não encontrada."));

        if (msg.getEstado() != EstadoMensagem.FALHOU) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Apenas mensagens com estado FALHOU podem ser reenviadas.");
        }

        if (!isBusOnline(msg.getBusId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 
                "O autocarro " + msg.getBusId() + " está offline. Impossível efetuar reenvio.");
        }

        // Atualizar campos e gerar novo correlation ID
        msg.setEstado(EstadoMensagem.ENVIADA);
        msg.setOperador(operador);
        msg.setTimestampEnvio(Instant.now());
        msg.setTimestampEntrega(null);
        msg.setTimestampLeitura(null);
        msg.setErroDetalhe(null);
        
        String novoMqttId = UUID.randomUUID().toString();
        msg.setMqttMessageId(novoMqttId);

        MensagemDespacho salva = mensagemRepository.save(msg);
        MensagemDespachoDTO dto = mapToDTO(salva);

        // Disparar MQTT e WS
        mqttService.publicarMensagem(salva.getBusId(), novoMqttId, salva.getConteudo(), operador);
        notificarOperador(dto);

        // Agendar novo timeout
        agendarTimeoutVerificacao(salva.getId());

        // Registar Auditoria (MENSAGEM_ENVIADA - truncado a 50 chars)
        String conteudoTruncado = salva.getConteudo();
        if (conteudoTruncado != null && conteudoTruncado.length() > 50) {
            conteudoTruncado = conteudoTruncado.substring(0, 50);
        }
        registrarAuditoria(operador, "MENSAGEM_ENVIADA", "reenviarMensagem", true, conteudoTruncado);

        return dto;
    }

    public void cancelarMensagem(Long mensagemId, String operador) {
        log.info("Operador {} cancelou o envio da mensagem #{}", operador, mensagemId);

        MensagemDespacho msg = mensagemRepository.findById(mensagemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Mensagem não encontrada."));

        if (msg.getEstado() != EstadoMensagem.ENVIADA) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Apenas mensagens no estado ENVIADA podem ser canceladas.");
        }

        msg.setEstado(EstadoMensagem.CANCELADA);
        msg.setErroDetalhe("Envio cancelado manualmente pelo operador: " + operador);
        
        MensagemDespacho salva = mensagemRepository.save(msg);
        notificarOperador(mapToDTO(salva));

        // Registar Auditoria (MENSAGEM_CANCELADA)
        registrarAuditoria(operador, "MENSAGEM_CANCELADA", "cancelarMensagem", true, "Mensagem #" + mensagemId + " cancelada pelo operador.");
    }

    @EventListener
    public void onMqttAckReceived(MqttAckEvent event) {
        // Corre no contexto transacional correto encapsulado
        transactionTemplate.executeWithoutResult(status -> {
            processarAck(event.getBusId(), event.getMessageId(), event.getType());
        });
    }

    private void agendarTimeoutVerificacao(Long id) {
        scheduler.schedule(() -> {
            transactionTemplate.executeWithoutResult(status -> {
                verificarTimeout(id);
            });
        }, deliveryTimeoutSec, TimeUnit.SECONDS);
    }

    private void verificarTimeout(Long id) {
        Optional<MensagemDespacho> msgOpt = mensagemRepository.findById(id);
        if (msgOpt.isPresent()) {
            MensagemDespacho msg = msgOpt.get();
            if (msg.getEstado() == EstadoMensagem.ENVIADA) {
                msg.setEstado(EstadoMensagem.FALHOU);
                msg.setErroDetalhe("TIMEOUT: Viatura offline ou incapaz de receber a mensagem em " + deliveryTimeoutSec + " segundos.");
                
                MensagemDespacho salva = mensagemRepository.save(msg);
                notificarOperador(mapToDTO(salva));
                log.warn("TIMEOUT verificado para mensagem #{} (Viatura {})", id, msg.getBusId());

                // Registar Auditoria (MENSAGEM_FALHOU - detalhe do erro)
                registrarAuditoria(msg.getOperador(), "MENSAGEM_FALHOU", "verificarTimeout", false, msg.getErroDetalhe());
            }
        }
    }

    private void registrarAuditoria(String username, String action, String method, boolean success, String details) {
        try {
            AuditLog audit = new AuditLog(
                username != null ? username : "sistema",
                action,
                "DespachoService",
                method,
                success,
                details
            );
            auditLogRepository.save(audit);
            log.info("Auditoria registrada com sucesso: [{}] pelo operador {}", action, username);
        } catch (Exception e) {
            log.error("Falha ao salvar log de auditoria para ação {}: {}", action, e.getMessage());
        }
    }

    private void notificarOperador(MensagemDespachoDTO dto) {
        String destino = "/topic/mensagens/" + dto.getBusId();
        messagingTemplate.convertAndSend(destino, dto);
        log.debug("Notificação WebSocket emitida para {}: Estado {}", destino, dto.getEstado());
    }

    private MensagemDespachoDTO mapToDTO(MensagemDespacho msg) {
        MensagemDespachoDTO dto = new MensagemDespachoDTO();
        dto.setId(msg.getId());
        dto.setBusId(msg.getBusId());
        dto.setConteudo(msg.getConteudo());
        dto.setEstado(msg.getEstado().name());
        dto.setOperador(msg.getOperador());
        dto.setTimestampEnvio(msg.getTimestampEnvio());
        dto.setTimestampEntrega(msg.getTimestampEntrega());
        dto.setTimestampLeitura(msg.getTimestampLeitura());
        dto.setErroDetalhe(msg.getErroDetalhe());
        dto.setMqttMessageId(msg.getMqttMessageId());
        dto.setLidaPeloOperador(msg.isLidaPeloOperador());
        return dto;
    }
}
