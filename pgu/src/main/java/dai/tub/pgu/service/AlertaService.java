package dai.tub.pgu.service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.model.HistoricoAlerta;
import dai.tub.pgu.repository.HistoricoAlertaRepository;

@Service
public class AlertaService {

    @Autowired
    private HistoricoAlertaRepository historicoRepository;

    @Autowired
    private JavaMailSender mailSender;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    public void processarTelemetria(TelemetryDTO telemetria) {
        // Lógica existente de processamento...

        //REVER
        // Verificação de alertas críticos
        if ("AVARIADO".equalsIgnoreCase(telemetria.getStatus())) {
            String motivo = "AVARIADO".equalsIgnoreCase(telemetria.getStatus()) 
                ? "O autocarro reportou que está avariado."
                : "O autocarro reportou um status crítico: " + telemetria.getStatus(); 
    

            dispararAlertaCritico(telemetria.getBusId(), motivo);
        }
    }

    private void dispararAlertaCritico(String autocarroId, String motivo) {
        // 1. Guardar no Histórico (#R.BO.08)
        HistoricoAlerta alerta = new HistoricoAlerta(autocarroId, motivo);
        historicoRepository.save(alerta);

        String mensagemAlerta = "ALERTA CRÍTICO: Autocarro " + autocarroId + " reportou problema: " + motivo;

        // 2. Enviar Email (#R.BO.07)
        enviarEmail("admin@tub.pt", "Alerta Crítico PGU", mensagemAlerta);

        // 3. Enviar para o Frontend via WebSocket
        // Usamos um tópico específico para alertas para não misturar com o tráfego normal
        messagingTemplate.convertAndSend("/topic/alertas", mensagemAlerta);
    }

    private void enviarEmail(String destinatario, String assunto, String mensagem) {
        SimpleMailMessage mail = new SimpleMailMessage();
        mail.setTo(destinatario);
        mail.setSubject(assunto);
        mail.setText(mensagem);
        mail.setFrom("sistema@tub.pt");
        mailSender.send(mail);
    }
}