package dai.tub.pgu.service;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.DisplayPanel;
import dai.tub.pgu.dto.StopEtaDTO;
import dai.tub.pgu.dto.StopPanelDTO;
import dai.tub.pgu.repository.DisplayPanelRepository;

/**
 * Sprint 5 (follow-up): empurra periodicamente o conteúdo a apresentar
 * em cada painel DMS para o broker MQTT. Os painéis físicos (ou o
 * simulador, em demo) subscrevem {@code tub/panels/{panelCode}/content}
 * e renderizam as próximas chegadas.
 *
 * <p>Ciclo: a cada 30s, para cada painel ONLINE, busca os ETAs via
 * {@link StopPanelService#getPanel(Long)} e publica o JSON.</p>
 *
 * <p>Sem isto, o backoffice já mostra os ETAs (puxa REST), mas os painéis
 * fisicos nunca recebem nada — só heartbeat unidirecional.</p>
 */
@Service
public class PanelContentScheduler
{
    private static final Logger log = LoggerFactory.getLogger(PanelContentScheduler.class);
    private static final String TOPIC_PREFIX = "tub/panels/";
    private static final String TOPIC_SUFFIX = "/content";

    private final DisplayPanelRepository panelRepo;
    private final StopPanelService stopPanelService;
    private final MqttDespachoService mqtt;

    public PanelContentScheduler(DisplayPanelRepository panelRepo,
                                  StopPanelService stopPanelService,
                                  MqttDespachoService mqtt)
    {
        this.panelRepo = panelRepo;
        this.stopPanelService = stopPanelService;
        this.mqtt = mqtt;
    }

    @Scheduled(fixedDelay = 30_000L, initialDelay = 20_000L)
    public void pushContentToPanels()
    {
        List<DisplayPanel> panels;
        try {
            panels = panelRepo.findAll();
        } catch (Exception e) {
            log.warn("PanelContentScheduler: nao foi possivel listar paineis: {}", e.getMessage());
            return;
        }

        int sent = 0;
        for (DisplayPanel p : panels) {
            if (p == null || !Boolean.TRUE.equals(p.getEnabled())) continue;
            String code = p.getCode();
            Long stopId = p.getStopId();
            if (code == null || stopId == null) continue;

            try {
                StopPanelDTO panel = stopPanelService.getPanel(stopId);
                Map<String, Object> payload = new HashMap<>();
                payload.put("panelCode", code);
                payload.put("ts", Instant.now().toString());
                payload.put("stopName", panel.getStopName());
                payload.put("stopCode", panel.getStopCode());
                payload.put("panelMessage", panel.getPanelMessage());
                payload.put("arrivals", panel.getEtas() != null ? panel.getEtas() : List.<StopEtaDTO>of());

                String topic = TOPIC_PREFIX + code + TOPIC_SUFFIX;
                if (mqtt.publishToTopic(topic, payload)) sent++;
            } catch (Exception e) {
                log.warn("PanelContentScheduler: falha a publicar conteudo para {}: {}",
                    code, e.getMessage());
            }
        }
        if (sent > 0) log.debug("PanelContentScheduler: {} painéis actualizados", sent);
    }
}
