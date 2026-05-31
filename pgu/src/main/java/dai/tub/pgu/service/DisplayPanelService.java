package dai.tub.pgu.service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.domain.DisplayPanel;
import dai.tub.pgu.domain.DisplayPanelEvent;
import dai.tub.pgu.repository.DisplayPanelEventRepository;
import dai.tub.pgu.repository.DisplayPanelRepository;

/**
 * Sprint 3 (3.5): logica de paineis DMS. Heartbeats, CRUD, mudancas de
 * status, alarmistica. Scheduler de saude espelha o DataSourceHealthService.
 */
@Service
public class DisplayPanelService {

    private static final Logger log = LoggerFactory.getLogger(DisplayPanelService.class);

    private final DisplayPanelRepository panelRepo;
    private final DisplayPanelEventRepository eventRepo;
    private final SimpMessagingTemplate messagingTemplate;

    public DisplayPanelService(DisplayPanelRepository panelRepo,
                               DisplayPanelEventRepository eventRepo,
                               SimpMessagingTemplate messagingTemplate) {
        this.panelRepo = panelRepo;
        this.eventRepo = eventRepo;
        this.messagingTemplate = messagingTemplate;
    }

    // CRUD =================================================================

    public List<DisplayPanel> list() {
        return panelRepo.findAllByOrderByNameAsc();
    }

    public DisplayPanel get(Long id) {
        return panelRepo.findById(id).orElseThrow(() ->
            new IllegalArgumentException("Painel " + id + " nao encontrado"));
    }

    @Transactional
    public DisplayPanel create(DisplayPanel panel) {
        panel.setStatus("UNKNOWN");
        panel.setCreatedAt(Instant.now());
        panel.setUpdatedAt(Instant.now());
        return panelRepo.save(panel);
    }

    @Transactional
    public DisplayPanel update(Long id, DisplayPanel patch) {
        DisplayPanel p = get(id);
        if (patch.getName() != null) p.setName(patch.getName());
        if (patch.getType() != null) p.setType(patch.getType());
        if (patch.getStopId() != null) p.setStopId(patch.getStopId());
        if (patch.getCurrentMessage() != null) p.setCurrentMessage(patch.getCurrentMessage());
        if (patch.getContentSource() != null) p.setContentSource(patch.getContentSource());
        if (patch.getEnabled() != null) p.setEnabled(patch.getEnabled());
        return panelRepo.save(p);
    }

    @Transactional
    public void delete(Long id) {
        panelRepo.deleteById(id);
    }

    // HEARTBEAT ============================================================

    /**
     * Recebido via MQTT->NiFi->POST /api/v1/panels/heartbeat.
     * Identifica painel pelo code. Actualiza status segundo regras:
     *  - battery <= critical -> LOW_BATTERY
     *  - senao -> ONLINE
     */
    @Transactional
    public void recordHeartbeat(String code, Short batteryPct, BigDecimal temperatureC,
                                String firmware, String reportedStatus) {
        DisplayPanel p = panelRepo.findByCode(code).orElse(null);
        if (p == null) {
            log.warn("[DMS] heartbeat de painel desconhecido: code={}", code);
            return;
        }
        Instant now = Instant.now();
        p.setLastHeartbeat(now);
        if (batteryPct != null)      p.setBatteryPct(batteryPct);
        if (temperatureC != null)    p.setTemperatureC(temperatureC);
        if (firmware != null)        p.setFirmwareVersion(firmware);

        String newStatus;
        if ("FAULTY".equals(reportedStatus)) {
            newStatus = "FAULTY";
        } else if (batteryPct != null && batteryPct <= p.getBatteryCriticalPct()) {
            newStatus = "LOW_BATTERY";
        } else {
            newStatus = "ONLINE";
        }
        boolean changed = !newStatus.equals(p.getStatus());
        p.setStatus(newStatus);
        panelRepo.save(p);

        // historico
        DisplayPanelEvent ev = new DisplayPanelEvent();
        ev.setPanelId(p.getId());
        ev.setTs(now);
        ev.setEventType(changed ? "STATUS_CHANGE" : "HEARTBEAT");
        ev.setStatus(newStatus);
        ev.setBatteryPct(batteryPct);
        ev.setTemperatureC(temperatureC);
        eventRepo.save(ev);

        // broadcast STOMP
        try {
            messagingTemplate.convertAndSend("/topic/panels", Map.of(
                "code", p.getCode(),
                "status", newStatus,
                "batteryPct", batteryPct == null ? -1 : batteryPct,
                "temperatureC", temperatureC == null ? 0 : temperatureC,
                "lastHeartbeat", now.toString(),
                "changed", changed
            ));
        } catch (Exception ignored) {}

        if (changed) {
            log.info("[DMS] {} {} -> {}", p.getCode(), p.getStatus(), newStatus);
        }
    }

    // SCHEDULER ============================================================

    /** A cada 30s: marca OFFLINE qualquer painel sem heartbeat dentro do limite. */
    @Scheduled(fixedDelay = 30_000)
    @Transactional
    public void detectOffline() {
        Instant now = Instant.now();
        // cutoff dinamico por painel (cada um tem o seu offline_threshold_seconds).
        // Aqui simplificamos para 5min (default). Quem quiser custom faz por scan.
        Instant cutoff = now.minus(Duration.ofSeconds(300));
        List<DisplayPanel> stale = panelRepo.findStaleHeartbeat(cutoff);
        for (DisplayPanel p : stale) {
            if ("OFFLINE".equals(p.getStatus())) continue;
            p.setStatus("OFFLINE");
            panelRepo.save(p);
            DisplayPanelEvent ev = new DisplayPanelEvent();
            ev.setPanelId(p.getId());
            ev.setTs(now);
            ev.setEventType("STATUS_CHANGE");
            ev.setStatus("OFFLINE");
            ev.setDetail("no heartbeat > 5 min");
            eventRepo.save(ev);
            try {
                messagingTemplate.convertAndSend("/topic/panels", Map.of(
                    "code", p.getCode(), "status", "OFFLINE",
                    "lastHeartbeat", p.getLastHeartbeat() == null ? "" : p.getLastHeartbeat().toString(),
                    "changed", true
                ));
            } catch (Exception ignored) {}
            log.warn("[DMS] {} marcado OFFLINE (sem heartbeat)", p.getCode());
        }
    }

    // STATS =================================================================

    public Map<String, Object> stats() {
        return Map.of(
            "total", panelRepo.count(),
            "byStatus", panelRepo.countByStatus(),
            "byType", panelRepo.countByType()
        );
    }
}
