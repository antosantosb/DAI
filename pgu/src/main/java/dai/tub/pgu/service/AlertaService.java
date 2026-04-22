package dai.tub.pgu.service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.model.HistoricoAlerta;
import dai.tub.pgu.repository.HistoricoAlertaRepository;

@Service
public class AlertaService {

    private static final Logger log = LoggerFactory.getLogger(AlertaService.class);

    private final HistoricoAlertaRepository historicoRepository;
    private final JavaMailSender mailSender;
    private final SimpMessagingTemplate messagingTemplate;

    /** Cooldown entre alertas do mesmo autocarro (evita spam). */
    @Value("${pgu.alertas.cooldown-minutes:5}")
    private int cooldownMinutes;

    @Value("${pgu.alertas.email.destinatario:}")
    private String emailDestinatario;

    @Value("${pgu.alertas.email.remetente:sistema@tub.pt}")
    private String emailRemetente;

    /** Registo do último alerta por autocarro para debounce. */
    private final Map<String, Instant> ultimoAlerta = new ConcurrentHashMap<>();

    public AlertaService(HistoricoAlertaRepository historicoRepository,
                         JavaMailSender mailSender,
                         SimpMessagingTemplate messagingTemplate) {
        this.historicoRepository = historicoRepository;
        this.mailSender = mailSender;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Avalia telemetria recebida e dispara alerta se o status for crítico.
     * Aplica cooldown por autocarro para evitar spam de alertas repetidos.
     */
    public void processarTelemetria(TelemetryDTO telemetria) {
        if (telemetria == null || telemetria.getStatus() == null) return;

        String status = telemetria.getStatus();
        String busId = telemetria.getBusId();

        if ("AVARIADO".equalsIgnoreCase(status)) {
            // Debounce: ignorar se já alertámos sobre este autocarro recentemente
            Instant ultimo = ultimoAlerta.get(busId);
            if (ultimo != null && Instant.now().isBefore(ultimo.plusSeconds(cooldownMinutes * 60L))) {
                return;
            }
            dispararAlertaCritico(busId, "O autocarro reportou que está avariado.");
        }
    }

    private void dispararAlertaCritico(String autocarroId, String motivo) {
        // 1. Guardar no Histórico (prioridade máxima — nunca falha por causa do email)
        HistoricoAlerta alerta = new HistoricoAlerta(autocarroId, motivo);
        historicoRepository.save(alerta);
        ultimoAlerta.put(autocarroId, Instant.now());

        String mensagemAlerta = "ALERTA CRÍTICO: Autocarro " + autocarroId + " — " + motivo;

        // 2. Enviar para o Frontend via WebSocket
        messagingTemplate.convertAndSend("/topic/alertas", mensagemAlerta);
        log.warn("Alerta crítico disparado: {}", mensagemAlerta);

        // 3. Enviar Email (tolerante a falhas — não bloqueia o fluxo)
        if (emailDestinatario != null && !emailDestinatario.isBlank()) {
            try {
                enviarEmail(emailDestinatario, "Alerta Crítico PGU", mensagemAlerta);
            } catch (Exception e) {
                log.error("Falha ao enviar email de alerta para {}: {}", emailDestinatario, e.getMessage());
            }
        }
    }

    private void enviarEmail(String destinatario, String assunto, String mensagem) {
        SimpleMailMessage mail = new SimpleMailMessage();
        mail.setTo(destinatario);
        mail.setSubject(assunto);
        mail.setText(mensagem);
        mail.setFrom(emailRemetente);
        mailSender.send(mail);
    }
}