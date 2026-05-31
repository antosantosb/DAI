package dai.tub.pgu.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import dai.tub.pgu.domain.Ocorrencia;
import dai.tub.pgu.domain.EstadoOcorrencia;
import dai.tub.pgu.dto.OcorrenciaDTO;
import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.model.HistoricoAlerta;
import dai.tub.pgu.repository.HistoricoAlertaRepository;
import dai.tub.pgu.repository.OcorrenciaRepository;
import dai.tub.pgu.domain.GlobalConfig;
import dai.tub.pgu.repository.GlobalConfigRepository;

@Service
public class AlertaService {

    private static final Logger log = LoggerFactory.getLogger(AlertaService.class);

    // Sprint -1 (BE-12): constructor injection em vez de @Autowired field.
    // Vantagens: campo final imutavel, testavel sem reflection, falha cedo se faltar.
    private final GlobalConfigRepository globalConfigRepository;
    private final HistoricoAlertaRepository historicoRepository;
    private final OcorrenciaRepository ocorrenciaRepository;
    private final OcorrenciaService ocorrenciaService;
    private final JavaMailSender mailSender;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    /** Cooldown entre alertas do mesmo ativo e anomalia (evita spam). */
    @Value("${pgu.alertas.cooldown-minutes:5}")
    private int cooldownMinutes;

    @Value("${pgu.alertas.email.destinatario:}")
    private String emailDestinatario;

    @Value("${pgu.alertas.email.remetente:sistema@tub.pt}")
    private String emailRemetente;

    @Value("${pgu.alertas.temperatura-critica-celsius:90.0}")
    private double temperaturaCritica;

    @Value("${pgu.alertas.bateria-critica-percentagem:10.0}")
    private double bateriaCritica;

    /** Registo do último alerta por ativo e tipo de anomalia para debounce. */
    private final Map<String, Instant> ultimoAlerta = new ConcurrentHashMap<>();

    private GlobalConfig cachedConfig = null;
    private Instant lastConfigFetch = Instant.MIN;

    private synchronized GlobalConfig getGlobalConfig() {
        Instant now = Instant.now();
        if (cachedConfig == null || lastConfigFetch.plus(10, ChronoUnit.MINUTES).isBefore(now)) {
            cachedConfig = globalConfigRepository.findAll().stream().findFirst().orElse(null);
            lastConfigFetch = now;
        }
        return cachedConfig;
    }

    public AlertaService(HistoricoAlertaRepository historicoRepository,
                          OcorrenciaRepository ocorrenciaRepository,
                          OcorrenciaService ocorrenciaService,
                          JavaMailSender mailSender,
                          SimpMessagingTemplate messagingTemplate,
                          ObjectMapper objectMapper,
                          GlobalConfigRepository globalConfigRepository) {
        this.historicoRepository = historicoRepository;
        this.ocorrenciaRepository = ocorrenciaRepository;
        this.ocorrenciaService = ocorrenciaService;
        this.mailSender = mailSender;
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
        this.globalConfigRepository = globalConfigRepository;
    }

    /**
     * Avalia telemetria recebida e dispara ocorrências se status ou sensores forem críticos.
     * Aplica cooldown por ativo + tipo de anomalia para evitar spam de ocorrências.
     */
  public void processarTelemetria(TelemetryDTO telemetria) {
        if (telemetria == null) return;

        String busId = telemetria.getBusId();
        if (busId == null || busId.isBlank()) return;

        // 0. CARREGAR PARÂMETROS GLOBAIS DA TUA TABELA
        GlobalConfig config = getGlobalConfig();
        
        // Se a tabela tiver valores, usamos esses; senão, usamos os de defeito da aplicação
        double limiteBateria = (config != null) ? config.getSocTolerancePercent() : bateriaCritica;
        int limiteAtraso = (config != null) ? config.getDelayLimitMinutes() : 5;

        // 1. Avariado
        if ("AVARIADO".equalsIgnoreCase(telemetria.getStatus())) {
            triggerOcorrencia(telemetria, "BUS", "AVARIADO", "O autocarro reportou que está avariado.");
        }

        // 2. Temperatura elevada
        if (telemetria.getTemperaturaMotor() != null && telemetria.getTemperaturaMotor() > temperaturaCritica) {
            triggerOcorrencia(telemetria, "BUS", "SOBREAQUECIMENTO", "Temperatura do motor elevada: " + telemetria.getTemperaturaMotor() + "°C.");
        }

        // 3. Bateria crítica (AGORA USA O VALOR DA TUA TABELA!)
        if (telemetria.getNivelBateria() != null && telemetria.getNivelBateria() < limiteBateria) {
            triggerOcorrencia(telemetria, "BUS", "BATERIA_CRITICA", "Nível de bateria crítico: " + telemetria.getNivelBateria() + "% (Abaixo do limite de " + limiteBateria + "%).");
        }

        // 4. Falha de carregador
        if ("FAULT".equalsIgnoreCase(telemetria.getStatusCarregador())) {
            triggerOcorrencia(telemetria, "CHARGER", "FALHA_CARREGADOR", "Falha crítica detetada no carregador associado.");
        }
        
        // 5. Atraso Crítico (AGORA USA O TEU DELAY LIMIT DA TABELA!)
        if (telemetria.getDelayMinutes() != null && telemetria.getDelayMinutes() > limiteAtraso) {
             triggerOcorrencia(telemetria, "BUS", "ATRASO_CRITICO", "O autocarro regista um atraso de " + telemetria.getDelayMinutes() + " minutos (Acima do limite de " + limiteAtraso + " min).");
        }
    }


    /**
     * Sprint 2 (Vertical 3.4, R.ICP.05): avalia a ocupacao de um autocarro e
     * dispara alertas quando ultrapassa os thresholds configurados no
     * GlobalConfig (occupancy_warning_pct / occupancy_critical_pct). A
     * percentagem e' onboard/capacidade. Aplica o mesmo cooldown por ativo+tipo.
     *
     * <p>Chamado pelo TelemetryService, que ja' resolveu a capacidade do
     * autocarro. Se a capacidade for invalida (<=0) ou nao houver ocupacao,
     * nao faz nada.
     *
     * @param telemetria leitura recebida (para snapshot e bus_id)
     * @param onboard    ocupacao instantanea a bordo
     * @param capacidade capacidade do autocarro
     */
    public void avaliarOcupacao(TelemetryDTO telemetria, int onboard, int capacidade) {
        if (telemetria == null || capacidade <= 0 || onboard <= 0) return;

        GlobalConfig config = getGlobalConfig();
        int warningPct  = (config != null && config.getOccupancyWarningPct()  != null) ? config.getOccupancyWarningPct()  : 80;
        int criticalPct = (config != null && config.getOccupancyCriticalPct() != null) ? config.getOccupancyCriticalPct() : 95;

        double pct = 100.0 * onboard / capacidade;

        if (pct >= criticalPct) {
            triggerOcorrencia(telemetria, "BUS", "OCUPACAO_CRITICA",
                "Ocupacao critica: " + onboard + "/" + capacidade + " ("
                + Math.round(pct) + "%, acima do limite de " + criticalPct + "%).");
        } else if (pct >= warningPct) {
            triggerOcorrencia(telemetria, "BUS", "OCUPACAO_ELEVADA",
                "Ocupacao elevada: " + onboard + "/" + capacidade + " ("
                + Math.round(pct) + "%, acima do limite de " + warningPct + "%).");
        }
    }

    /**
     * Sprint 2 (Vertical 3.4, R.ICP.05): emite um alerta de "sem dados de
     * ocupacao" para um autocarro activo que nao reporta ha mais do que o
     * limite configurado (occupancy_no_data_minutes). Reusa o cooldown via
     * triggerOcorrencia. Chamado pela verificacao periodica no TelemetryService.
     *
     * @param busId            codigo do autocarro
     * @param minutosSemDados  minutos desde a ultima telemetria
     */
    public void alertarSemDadosOcupacao(String busId, long minutosSemDados) {
        if (busId == null || busId.isBlank()) return;
        TelemetryDTO stub = new TelemetryDTO();
        stub.setBusId(busId);
        triggerOcorrencia(stub, "BUS", "SEM_DADOS_OCUPACAO",
            "Autocarro activo sem reportar ocupacao ha " + minutosSemDados + " minutos.");
    }

    private void triggerOcorrencia(TelemetryDTO telemetria, String tipoAtivo, String tipoAnomalia, String descricao) {
        String ativoId = telemetria.getBusId();
        String key = ativoId + ":" + tipoAnomalia;

        // Debounce: ignorar se já alertámos sobre este ativo e anomalia recentemente
        Instant ultimo = ultimoAlerta.get(key);
        if (ultimo != null && Instant.now().isBefore(ultimo.plusSeconds(cooldownMinutes * 60L))) {
            return;
        }

        ultimoAlerta.put(key, Instant.now());

        // 1. Guardar no Histórico de Alertas legado (para compatibilidade, nunca bloqueia)
        try {
            HistoricoAlerta alerta = new HistoricoAlerta(ativoId, tipoAnomalia + ": " + descricao);
            historicoRepository.save(alerta);
        } catch (Exception ex) {
            log.error("Erro ao guardar histórico de alerta: {}", ex.getMessage());
        }

        // 2. Criar ocorrência com ciclo de vida completo
        Ocorrencia o = new Ocorrencia();
        o.setAtivoId(ativoId);
        o.setTipoAtivo(tipoAtivo);
        o.setTipoAnomalia(tipoAnomalia);
        o.setDescricao(descricao);
        o.setEstado(EstadoOcorrencia.ABERTA);
        o.setTimestampAbertura(Instant.now());
        o.setCriadoPor("SISTEMA");

        // Inferir prioridade
        o.setPrioridade(ocorrenciaService.inferirPrioridade(tipoAnomalia));

        // Snapshot de telemetria
        try {
            String snapshotJson = objectMapper.writeValueAsString(telemetria);
            o.setTelemetriaSnapshot(snapshotJson);
        } catch (Exception ex) {
            log.error("Erro ao converter telemetria para snapshot JSON: {}", ex.getMessage());
        }

        // Verificar reincidência nas últimas 24h (mesmo ativo, mesmo tipo de anomalia)
        Instant since = Instant.now().minus(24, ChronoUnit.HOURS);
        List<Ocorrencia> parentList = ocorrenciaRepository.findByAtivoIdAndTipoAnomaliaAndTimestampAberturaAfter(
            ativoId, tipoAnomalia, since);
        if (!parentList.isEmpty()) {
            o.setReincidencia(true);
            o.setOcorrenciaPai(parentList.get(0));
        }

        Ocorrencia saved = ocorrenciaRepository.save(o);
        OcorrenciaDTO dto = ocorrenciaService.mapToDTO(saved);

        // 3. Enviar para o Frontend via WebSocket com o DTO completo
        messagingTemplate.convertAndSend("/topic/alertas", dto);
        log.warn("Alerta crítico processado e ocorrência criada: {} - {} - {}", tipoAtivo, tipoAnomalia, descricao);

        // 4. Enviar Email (tolerante a falhas)
        if (emailDestinatario != null && !emailDestinatario.isBlank()) {
            try {
                String mensagemAlerta = "ALERTA CRÍTICO DE OCORRÊNCIA: " + tipoAtivo + " " + ativoId + 
                    " — " + tipoAnomalia + " — " + descricao;
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