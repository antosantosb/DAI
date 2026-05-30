package dai.tub.pgu.service;

import dai.tub.pgu.domain.DataSource;
import dai.tub.pgu.domain.DataSourcePulse;
import dai.tub.pgu.dto.DataSourceDTO;
import dai.tub.pgu.repository.DataSourcePulseRepository;
import dai.tub.pgu.repository.DataSourceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Sprint 0 (F4): saude das DataSources.
 *
 * <p>Responsabilidades:
 * <ol>
 *   <li>Registar pulses recebidos via {@code POST /api/v1/data-sources/{id}/pulse}
 *       (chamado pelos componentes externos: simulador, NiFi, etc.).</li>
 *   <li>Scheduler periodico (a cada 30s) reavalia o estado de cada fonte com
 *       base na idade de {@code last_sync} e nos thresholds da fonte:
 *       <ul>
 *           <li>idade &lt; degradedThreshold -> HEALTHY</li>
 *           <li>idade &lt; downThreshold     -> DEGRADED</li>
 *           <li>idade ≥ downThreshold        -> DOWN (dispara alerta)</li>
 *       </ul>
 *   </li>
 *   <li>Calcular uptime 24h e 7d com base na tabela {@code data_source_pulse}.</li>
 *   <li>Broadcast WebSocket em {@code /topic/datasources} sempre que o estado muda,
 *       mais email para o owner quando uma fonte passa a DOWN.</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DataSourceHealthService {

    private final DataSourceRepository repo;
    private final DataSourcePulseRepository pulseRepo;
    private final SimpMessagingTemplate ws;
    private final JavaMailSender mailSender;
    private final JdbcTemplate jdbc;

    @Value("${pgu.alertas.email.remetente:sistema@tub.pt}")
    private String emailRemetente;

    @Value("${pgu.alertas.email.destinatario:}")
    private String fallbackEmailDestinatario;

    // Sprint 0 (F4 follow-up): para o probe ao Orion.
    @Value("${pgu.orion.v2-url:http://orion:1026/v2}")
    private String orionV2Url;

    /**
     * Regista pulse vindo do componente externo.
     * Marca como HEALTHY imediatamente (depois o scheduler pode degradar).
     */
    @Transactional
    public DataSource recordPulse(Long id, String detalhes) {
        DataSource ds = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("DataSource nao encontrada: " + id));
        if (!ds.isEnabled()) {
            log.debug("Pulse ignorado: DataSource {} esta desativada", ds.getNome());
            return ds;
        }
        OffsetDateTime now = OffsetDateTime.now();
        DataSource.Status previousStatus = ds.getStatus();
        ds.setLastSync(now);
        ds.setStatus(DataSource.Status.HEALTHY);
        repo.save(ds);

        DataSourcePulse pulse = new DataSourcePulse();
        pulse.setDataSource(ds);
        pulse.setTs(now);
        pulse.setStatus(DataSource.Status.HEALTHY);
        pulse.setDetalhes(detalhes);
        pulseRepo.save(pulse);

        if (previousStatus != DataSource.Status.HEALTHY) {
            log.info("DataSource {} recuperou: {} -> HEALTHY", ds.getNome(), previousStatus);
            broadcast(ds);
        }
        return ds;
    }

    /**
     * Sprint 1 (F9): regista um pulse a partir de um componente interno do
     * backend (publicadores GTFS-RT / NeTEx), resolvido pelo nome unico da
     * fonte em vez do id. Pensado para ser chamado de dentro do mesmo processo
     * (nao via HTTP), evitando que cada servico tenha de conhecer o id seeded.
     *
     * <p>Tolerante a falhas: se a fonte nao existir (seed em falta) ou o
     * registo falhar, regista warning e segue. Nunca propaga excecao para nao
     * partir a resposta do feed que o invocou.
     */
    // REQUIRES_NEW: o pulse e' uma escrita (INSERT em data_source_pulse) e tem de
    // correr na sua propria transacao read-write, para nunca participar nem
    // envenenar a transacao do chamador, que pode ser @Transactional(readOnly=true)
    // (ex.: o NeTEx export). Sem isto, o INSERT falha "cannot execute INSERT in a
    // read-only transaction" e a transacao externa rebenta no commit com
    // UnexpectedRollbackException. E' chamada cross-bean, logo o proxy aplica.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordPulseByName(String nome, String detalhes) {
        try {
            repo.findByNome(nome).ifPresentOrElse(
                ds -> recordPulse(ds.getId(), detalhes),
                () -> log.warn("Pulse interno ignorado: DataSource '{}' nao existe (seed em falta?)", nome));
        } catch (Exception e) {
            log.warn("Falha a registar pulse interno para DataSource '{}': {}", nome, e.getMessage());
        }
    }

    // Sprint 0 (F4 follow-up v2): evaluateAll() removido. O probeAll agora
    // decide o status directamente e regista todos os ticks (OK ou FAIL)
    // na tabela data_source_pulse. Uptime = ratio HEALTHY/total nos pulses.

    /**
     * Sprint 0 (F4 follow-up v2): probe único a cada 30s.
     *
     * <p>Modelo simples e auditável:
     * <ol>
     *   <li>Para cada fonte, decide OK/NOK:
     *     <ul>
     *       <li>SIMULATOR: depende de self-pulse (POST /pulse pelo simulator.py).
     *           OK se {@code last_sync} é mais novo que {@code down_threshold_seconds}.</li>
     *       <li>NIFI / MQTT: TCP socket check ao porto.</li>
     *       <li>ORION: HTTP GET /version.</li>
     *       <li>GTFS: existe import na tabela {@code gtfs_import} nos últimos 30d.</li>
     *     </ul>
     *   </li>
     *   <li>Determina próximo status: HEALTHY se OK; senão DEGRADED/DOWN consoante a
     *       idade de {@code last_sync}.</li>
     *   <li>Regista o resultado em {@code data_source_pulse} (uma linha por probe,
     *       por fonte). Uptime = COUNT(HEALTHY) / COUNT(*) na janela 24h/7d.</li>
     *   <li>Atualiza {@code last_sync} apenas se o probe foi OK e a fonte tem probe
     *       activo (não-SIMULATOR — caso contrário falsificaríamos o "vivo").</li>
     *   <li>Broadcasta WS + email alert quando o status muda para DOWN.</li>
     * </ol>
     */
    @Scheduled(fixedDelay = 30_000L, initialDelay = 10_000L)
    @Transactional
    public void probeAll() {
        OffsetDateTime now = OffsetDateTime.now();
        for (DataSource ds : repo.findByEnabledTrue()) {
            try {
                doProbeOne(ds, now);
            } catch (Exception e) {
                log.warn("Probe falhou inesperadamente para {}: {}", ds.getNome(), e.getMessage());
            }
        }
    }

    private void doProbeOne(DataSource ds, OffsetDateTime now) {
        DataSource.Status previous = ds.getStatus();
        boolean ok = probe(ds, now);

        DataSource.Status next;
        if (ok) {
            next = DataSource.Status.HEALTHY;
        } else if (ds.getLastSync() != null) {
            long age = Duration.between(ds.getLastSync(), now).getSeconds();
            if (age >= ds.getDownThresholdSeconds())          next = DataSource.Status.DOWN;
            else if (age >= ds.getDegradedThresholdSeconds()) next = DataSource.Status.DEGRADED;
            else                                              next = DataSource.Status.HEALTHY;
        } else {
            next = DataSource.Status.UNKNOWN;
        }

        DataSourcePulse entry = new DataSourcePulse();
        entry.setDataSource(ds);
        entry.setTs(now);
        entry.setStatus(next);
        entry.setDetalhes(ok ? "probe OK" : "probe FAIL");
        pulseRepo.save(entry);

        // Fontes self-pulse (SIMULATOR e, na F9, GTFS_RT/NETEX) NAO devem ter o
        // last_sync atualizado pelo probe: a frescura vem apenas dos pulses
        // internos/externos reais. Caso contrario o probe perpetuaria HEALTHY
        // indefinidamente, mascarando a ausencia de geracoes de feed/export.
        boolean selfPulse = isSelfPulse(ds.getTipo());
        if (ok && !selfPulse) {
            ds.setLastSync(now);
        }
        if (next != previous) {
            ds.setStatus(next);
            log.info("DataSource {} mudou: {} -> {}", ds.getNome(), previous, next);
            broadcast(ds);
            if (next == DataSource.Status.DOWN) {
                sendDownAlert(ds);
            }
        }
        if (ok || next != previous) {
            repo.save(ds);
        }
    }

    /**
     * Sprint 1 (F9): tipos cuja saude e' determinada por self-pulse (frescura do
     * last_sync) e nao por um probe externo. SIMULATOR pulsa via POST /pulse;
     * GTFS_RT/NETEX pulsam internamente a cada geracao de feed/export
     * (recordPulseByName). Para estes, o probe NAO deve tocar no last_sync.
     */
    private static boolean isSelfPulse(String tipo) {
        if (tipo == null) return false;
        return switch (tipo.toUpperCase()) {
            case "SIMULATOR", "GTFS_RT", "NETEX" -> true;
            default -> false;
        };
    }

    private boolean probe(DataSource ds, OffsetDateTime now) {
        String tipo = ds.getTipo();
        if (tipo == null) return false;
        // Fontes self-pulse: OK enquanto o ultimo pulse esta dentro do
        // `degraded_threshold_seconds`; senao o calculator decide DEGRADED
        // (idade ≥ degraded) ou DOWN (idade ≥ down).
        if (isSelfPulse(tipo)) {
            return ds.getLastSync() != null
                    && Duration.between(ds.getLastSync(), now).getSeconds() < ds.getDegradedThresholdSeconds();
        }
        return switch (tipo.toUpperCase()) {
            // Sprint 0 (F4 follow-up): probes especificos por componente.
            case "NIFI"      -> tcpReachable("nifi", 8443);
            case "MQTT"      -> tcpReachable("mosquitto", 1883);
            case "ORION"     -> orionReachable();
            case "GTFS"      -> hasGtfsImport();
            default          -> false;
        };
    }

    /**
     * Sprint 0 (F4 follow-up): TCP socket check com timeout de 2s. Suficiente
     * para confirmar que o servico esta a escutar no porto, sem precisar de
     * fazer handshake TLS ou autenticacao.
     */
    private boolean tcpReachable(String host, int port) {
        try (java.net.Socket s = new java.net.Socket()) {
            s.connect(new java.net.InetSocketAddress(host, port), 2000);
            return true;
        } catch (Exception e) {
            log.debug("tcpReachable {}:{} falhou: {}", host, port, e.getMessage());
            return false;
        }
    }

    private boolean orionReachable() {
        try {
            // GET ao Orion. Qualquer 2xx confirma que esta vivo.
            String base = orionV2Url == null ? "" : orionV2Url.replaceAll("/v2/?$", "");
            RestClient.builder()
                    .baseUrl(base)
                    .build()
                    .get()
                    .uri("/version")
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (Exception e) {
            log.debug("orionReachable falhou: {}", e.getMessage());
            return false;
        }
    }

    private boolean hasGtfsImport() {
        try {
            // Tabela gtfs_import (V20) usa created_at. Considera healthy se houve
            // qualquer import (mesmo nao finalizado) nos ultimos 30 dias — basta
            // mostrar que o GTFS esta a ser gerido.
            Long count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM gtfs_import WHERE created_at > NOW() - INTERVAL '30 days'",
                    Long.class);
            return count != null && count > 0;
        } catch (Exception e) {
            log.debug("hasGtfsImport falhou (tabela pode nao existir): {}", e.getMessage());
            return false;
        }
    }

    /**
     * Corre a cada 5 min. Atualiza uptime 24h e 7d para cada fonte.
     */
    @Scheduled(fixedDelay = 300_000L, initialDelay = 60_000L)
    @Transactional
    public void recalculateUptimes() {
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime since24h = now.minusHours(24);
        OffsetDateTime since7d = now.minusDays(7);

        for (DataSource ds : repo.findAll()) {
            Double up24 = pulseRepo.computeUptimePct(ds.getId(), since24h);
            Double up7d = pulseRepo.computeUptimePct(ds.getId(), since7d);
            ds.setUptimePct24h(up24 == null ? null : BigDecimal.valueOf(up24));
            ds.setUptimePct7d(up7d == null ? null : BigDecimal.valueOf(up7d));
            repo.save(ds);
        }
    }

    private void broadcast(DataSource ds) {
        try {
            ws.convertAndSend("/topic/datasources", DataSourceDTO.from(ds));
        } catch (Exception e) {
            log.warn("Falha a fazer broadcast WS de DataSource: {}", e.getMessage());
        }
    }

    /**
     * Sprint 0 (F4 follow-up): envia email de report de problema iniciado por um
     * utilizador (clicou no icone de email no card). Destinatario: contacto da
     * fonte, com fallback para o GlobalConfig.defaultOwnerEmail (via controller).
     *
     * @param ds            a fonte sobre a qual reportar
     * @param destinatario  email destino (ja resolvido com fallback)
     * @param reportedBy    username do user que clicou (para auditoria)
     * @param mensagem      mensagem livre opcional do user
     * @throws RuntimeException se o envio falhar
     */
    public void reportIssueByEmail(DataSource ds, String destinatario, String reportedBy, String mensagem) {
        if (destinatario == null || destinatario.isBlank()) {
            throw new RuntimeException("Sem destinatário definido para esta fonte.");
        }
        try {
            SimpleMailMessage mail = new SimpleMailMessage();
            mail.setTo(destinatario);
            mail.setFrom(emailRemetente);
            mail.setSubject("PGU-TUB: report de problema na fonte " + ds.getNome());
            StringBuilder body = new StringBuilder();
            body.append("Foi reportado um problema na fonte de dados '").append(ds.getNome()).append("'.\n\n");
            body.append("Tipo: ").append(ds.getTipo()).append("\n");
            body.append("Estado atual: ").append(ds.getStatus()).append("\n");
            body.append("Último pulse: ").append(ds.getLastSync() == null ? "(nunca)" : ds.getLastSync().toString()).append("\n");
            if (reportedBy != null && !reportedBy.isBlank()) {
                body.append("Reportado por: ").append(reportedBy).append("\n");
            }
            if (mensagem != null && !mensagem.isBlank()) {
                body.append("\nMensagem:\n").append(mensagem).append("\n");
            }
            mail.setText(body.toString());
            mailSender.send(mail);
            log.info("Report de problema enviado para {} (fonte={})", destinatario, ds.getNome());
        } catch (Exception e) {
            log.error("Falha a enviar email de report para {} (fonte={}): {}", destinatario, ds.getNome(), e.getMessage());
            throw new RuntimeException("Falha ao enviar email: " + e.getMessage(), e);
        }
    }

    private void sendDownAlert(DataSource ds) {
        String destinatario = ds.getContactoEmail() != null && !ds.getContactoEmail().isBlank()
                ? ds.getContactoEmail()
                : fallbackEmailDestinatario;
        if (destinatario == null || destinatario.isBlank()) {
            log.info("DataSource DOWN sem email destinatario: {}", ds.getNome());
            return;
        }
        try {
            SimpleMailMessage mail = new SimpleMailMessage();
            mail.setTo(destinatario);
            mail.setFrom(emailRemetente);
            mail.setSubject("PGU-TUB: fonte de dados DOWN — " + ds.getNome());
            mail.setText("A fonte de dados '" + ds.getNome() + "' (" + ds.getTipo() + ") deixou de enviar pulses ha mais de "
                    + ds.getDownThresholdSeconds() + "s.\n\n"
                    + "Owner: " + (ds.getOwner() == null ? "(nao definido)" : ds.getOwner()) + "\n"
                    + "Last sync: " + ds.getLastSync() + "\n\n"
                    + "Verifica o estado do componente.");
            mailSender.send(mail);
            log.info("Email de DataSource DOWN enviado para {}", destinatario);
        } catch (Exception e) {
            log.error("Falha a enviar email de DataSource DOWN para {}: {}", destinatario, e.getMessage());
        }
    }
}
