package dai.tub.pgu.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.ObjectMapper;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.domain.Ocorrencia;
import dai.tub.pgu.domain.EstadoOcorrencia;
import dai.tub.pgu.domain.PrioridadeOcorrencia;
import dai.tub.pgu.dto.OcorrenciaDTO;
import dai.tub.pgu.dto.OcorrenciaRequestDTO;
import dai.tub.pgu.repository.OcorrenciaRepository;
import org.springframework.beans.factory.annotation.Value;

@Service
@Transactional
public class OcorrenciaService {

    private static final Logger log = LoggerFactory.getLogger(OcorrenciaService.class);

    private final OcorrenciaRepository ocorrenciaRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    @Value("${pgu.alertas.escalada-critica-minutos:10}")
    private int escaladaCriticaMinutos;

    @Value("${pgu.alertas.escalada-normal-minutos:120}")
    private int escaladaNormalMinutos;

    public OcorrenciaService(OcorrenciaRepository ocorrenciaRepository,
                             SimpMessagingTemplate messagingTemplate,
                             ObjectMapper objectMapper) {
        this.ocorrenciaRepository = ocorrenciaRepository;
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    @LogActivity(action = "Criar Ocorrência")
    public OcorrenciaDTO criarOcorrencia(OcorrenciaRequestDTO.RegistarOcorrenciaRequest request, String criadoPor) {
        Ocorrencia o = new Ocorrencia();
        o.setAtivoId(request.getAtivoId());
        o.setTipoAtivo(request.getTipoAtivo() != null ? request.getTipoAtivo() : "BUS");
        o.setTipoAnomalia(request.getTipoAnomalia());
        o.setDescricao(request.getDescricao());
        o.setNotasIniciais(request.getNotasIniciais());
        o.setCriadoPor(criadoPor);
        o.setEstado(EstadoOcorrencia.ABERTA);
        o.setTimestampAbertura(Instant.now());

        // Inferir prioridade
        PrioridadeOcorrencia priority = inferirPrioridade(request.getTipoAnomalia());
        if (request.getPrioridade() != null) {
            try {
                priority = PrioridadeOcorrencia.valueOf(request.getPrioridade().toUpperCase());
            } catch (Exception ex) {
                // usar prioridade inferida
            }
        }
        o.setPrioridade(priority);

        // Verificar reincidência nas últimas 24 horas
        Instant since = Instant.now().minus(24, ChronoUnit.HOURS);
        List<Ocorrencia> parentList = ocorrenciaRepository.findByAtivoIdAndTipoAnomaliaAndTimestampAberturaAfter(
            request.getAtivoId(), request.getTipoAnomalia(), since);

        if (!parentList.isEmpty()) {
            o.setReincidencia(true);
            // Referenciar o pai mais antigo ou mais recente na janela de 24h
            o.setOcorrenciaPai(parentList.get(0));
        }

        Ocorrencia saved = ocorrenciaRepository.save(o);
        OcorrenciaDTO dto = mapToDTO(saved);

        // Publicar no websocket
        messagingTemplate.convertAndSend("/topic/alertas", dto);

        return dto;
    }

    @LogActivity(action = "Assumir Ocorrência")
    public OcorrenciaDTO assumirOcorrencia(Long id, String username) {
        Ocorrencia o = ocorrenciaRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ocorrência não encontrada."));

        if (o.getEstado() != EstadoOcorrencia.ABERTA) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Apenas ocorrências ABERTAS podem ser assumidas.");
        }

        o.setResponsavel(username);
        o.setEstado(EstadoOcorrencia.EM_CURSO);
        o.setTimestampAssumida(Instant.now());

        Ocorrencia saved = ocorrenciaRepository.save(o);
        OcorrenciaDTO dto = mapToDTO(saved);

        // Notificar via WebSocket
        messagingTemplate.convertAndSend("/topic/alertas", dto);

        return dto;
    }

    @LogActivity(action = "Registar Ação Corretiva")
    public OcorrenciaDTO registarAcaoCorretiva(Long id, String acao, String username) {
        Ocorrencia o = ocorrenciaRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ocorrência não encontrada."));

        o.setAcaoCorretiva(acao);

        Ocorrencia saved = ocorrenciaRepository.save(o);
        OcorrenciaDTO dto = mapToDTO(saved);

        messagingTemplate.convertAndSend("/topic/alertas", dto);

        return dto;
    }

    @LogActivity(action = "Fechar Ocorrência")
    public OcorrenciaDTO fecharOcorrencia(Long id, OcorrenciaRequestDTO.FecharOcorrenciaRequest request, String username) {
        Ocorrencia o = ocorrenciaRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ocorrência não encontrada."));

        o.setTimestampFecho(Instant.now());

        if (request.isFalsoPositivo()) {
            o.setEstado(EstadoOcorrencia.FALSO_POSITIVO);
            o.setFalsoPositivoJustificacao(request.getJustificacao());
        } else {
            o.setEstado(EstadoOcorrencia.RESOLVIDA);
            o.setAcaoCorretiva(request.getAcaoCorretiva());
        }

        // Se ninguém assumiu e está a ser fechada, atribuir o responsável atual
        if (o.getResponsavel() == null) {
            o.setResponsavel(username);
        }

        Ocorrencia saved = ocorrenciaRepository.save(o);
        OcorrenciaDTO dto = mapToDTO(saved);

        messagingTemplate.convertAndSend("/topic/alertas", dto);

        return dto;
    }

    @LogActivity(action = "Marcar Falso Positivo")
    public OcorrenciaDTO marcarFalsoPositivo(Long id, String justificacao, String username) {
        Ocorrencia o = ocorrenciaRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ocorrência não encontrada."));

        o.setEstado(EstadoOcorrencia.FALSO_POSITIVO);
        o.setFalsoPositivoJustificacao(justificacao);
        o.setTimestampFecho(Instant.now());

        if (o.getResponsavel() == null) {
            o.setResponsavel(username);
        }

        Ocorrencia saved = ocorrenciaRepository.save(o);
        OcorrenciaDTO dto = mapToDTO(saved);

        messagingTemplate.convertAndSend("/topic/alertas", dto);

        return dto;
    }

    @Transactional(readOnly = true)
    public List<OcorrenciaDTO> listarOcorrencias(EstadoOcorrencia estado, String ativoId) {
        return ocorrenciaRepository.findAll().stream()
            .filter(o -> estado == null || o.getEstado() == estado)
            .filter(o -> ativoId == null || o.getAtivoId().equalsIgnoreCase(ativoId))
            .map(this::mapToDTO)
            .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public OcorrenciaDTO getById(Long id) {
        Ocorrencia o = ocorrenciaRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ocorrência não encontrada."));
        return mapToDTO(o);
    }

    /**
     * Escalada automática: verifica ocorrências abertas sem responsável.
     * Corre a cada 1 minuto.
     */
    @Scheduled(fixedRate = 60000)
    public void verificarEscaladasPendentes() {
        log.debug("A executar verificação de ocorrências pendentes para escalada...");
        
        // 1. Escalamento de Críticos
        Instant thresholdCritica = Instant.now().minus(escaladaCriticaMinutos, ChronoUnit.MINUTES);
        List<Ocorrencia> pendentesCriticas = ocorrenciaRepository.findByPrioridadeAndEstadoAndTimestampAberturaBefore(
            PrioridadeOcorrencia.CRITICA, EstadoOcorrencia.ABERTA, thresholdCritica);

        for (Ocorrencia o : pendentesCriticas) {
            String msg = "ALERTA ESCALADO (CRÍTICO): A ocorrência crítica #" + o.getId() + " [" + o.getTipoAnomalia() + 
                "] no ativo " + o.getAtivoId() + " está sem responsável atribuído há mais de " + escaladaCriticaMinutos + " minutos!";
            messagingTemplate.convertAndSend("/topic/alertas-escalada", msg);
            log.warn("Escalada crítica enviada: {}", msg);
        }

        // 2. Escalamento de Normais
        Instant thresholdNormal = Instant.now().minus(escaladaNormalMinutos, ChronoUnit.MINUTES);
        List<Ocorrencia> pendentesNormais = ocorrenciaRepository.findByPrioridadeAndEstadoAndTimestampAberturaBefore(
            PrioridadeOcorrencia.NORMAL, EstadoOcorrencia.ABERTA, thresholdNormal);

        for (Ocorrencia o : pendentesNormais) {
            String msg = "ALERTA ESCALADO (NORMAL): A ocorrência normal #" + o.getId() + " [" + o.getTipoAnomalia() + 
                "] no ativo " + o.getAtivoId() + " está sem responsável atribuído há mais de " + escaladaNormalMinutos + " minutos!";
            messagingTemplate.convertAndSend("/topic/alertas-escalada", msg);
            log.warn("Escalada normal enviada: {}", msg);
        }
    }

    public PrioridadeOcorrencia inferirPrioridade(String tipoAnomalia) {
        if (tipoAnomalia == null) return PrioridadeOcorrencia.NORMAL;
        String upper = tipoAnomalia.toUpperCase();
        if (upper.contains("SOBREAQUECIMENTO") || upper.contains("CRITICA") || 
            upper.contains("FALHA") || upper.contains("AVARIADO") || upper.contains("BATERIA_CRITICA")) {
            return PrioridadeOcorrencia.CRITICA;
        }
        return PrioridadeOcorrencia.NORMAL;
    }

    public OcorrenciaDTO mapToDTO(Ocorrencia o) {
        if (o == null) return null;
        OcorrenciaDTO dto = new OcorrenciaDTO();
        dto.setId(o.getId());
        dto.setAtivoId(o.getAtivoId());
        dto.setTipoAtivo(o.getTipoAtivo());
        dto.setTipoAnomalia(o.getTipoAnomalia());
        dto.setDescricao(o.getDescricao());
        dto.setPrioridade(o.getPrioridade().name());
        dto.setEstado(o.getEstado().name());
        dto.setTimestampAbertura(o.getTimestampAbertura());
        dto.setTimestampAssumida(o.getTimestampAssumida());
        dto.setTimestampFecho(o.getTimestampFecho());
        dto.setResponsavel(o.getResponsavel());
        dto.setNotasIniciais(o.getNotasIniciais());
        dto.setAcaoCorretiva(o.getAcaoCorretiva());
        dto.setFalsoPositivoJustificacao(o.getFalsoPositivoJustificacao());
        dto.setReincidencia(o.isReincidencia());
        dto.setOcorrenciaPaiId(o.getOcorrenciaPai() != null ? o.getOcorrenciaPai().getId() : null);
        dto.setCriadoPor(o.getCriadoPor());

        if (o.getTelemetriaSnapshot() != null) {
            try {
                dto.setTelemetriaSnapshot(objectMapper.readTree(o.getTelemetriaSnapshot()));
            } catch (Exception ex) {
                log.error("Falha ao deserializar snapshot de telemetria para DTO: {}", ex.getMessage());
            }
        }
        return dto;
    }
}
