package dai.tub.pgu.service;

import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.domain.FareConfig;
import dai.tub.pgu.domain.StopZone;
import dai.tub.pgu.domain.Ticket;
import dai.tub.pgu.domain.ValidationEvent;
import dai.tub.pgu.dto.ValidationEventDTO;
import dai.tub.pgu.repository.FareConfigRepository;
import dai.tub.pgu.repository.StopZoneRepository;
import dai.tub.pgu.repository.TicketRepository;
import dai.tub.pgu.repository.ValidationEventRepository;

/**
 * Sprint 5 (3.3): ingestao real de validacoes de bilhetica.
 *
 * Algoritmo:
 *  1) resolve a coroa pela paragem (StopZone) — fallback 1 (centro).
 *  2) detecta transbordo: se ja' existe ticket activo (validUntil > now)
 *     para o mesmo cardPseudoId, NAO emite novo ticket — reaproveita e
 *     marca o ValidationEvent como transbordo (raw_payload {transfer:true}).
 *  3) se for nova validacao, consulta fare_config para o preco (canal +
 *     coroas + categoria + data) e cria Ticket com validUntil = now + 1h
 *     (1C) ou 1h30 (2C).
 *  4) persiste ValidationEvent ligado ao ticket.
 *  5) broadcast STOMP em /topic/ticketing para o dashboard.
 *
 * RGPD: cardPseudoId = SHA-256(cardId || PGU_TICKET_SALT). Bordo (numerario)
 * fica null. Salt fallback dev se env var ausente.
 */
@Service
public class ValidationService
{
    private static final Logger log = LoggerFactory.getLogger(ValidationService.class);

    private final TicketRepository ticketRepo;
    private final ValidationEventRepository veRepo;
    private final FareConfigRepository fareRepo;
    private final StopZoneRepository stopZoneRepo;
    private final SimpMessagingTemplate messagingTemplate;
    private final GeometryFactory geometryFactory;

    @Value("${pgu.ticket.salt:dev-salt-DO-NOT-USE-IN-PROD}")
    private String ticketSalt;

    public ValidationService(TicketRepository ticketRepo,
                             ValidationEventRepository veRepo,
                             FareConfigRepository fareRepo,
                             StopZoneRepository stopZoneRepo,
                             SimpMessagingTemplate messagingTemplate)
    {
        this.ticketRepo = ticketRepo;
        this.veRepo = veRepo;
        this.fareRepo = fareRepo;
        this.stopZoneRepo = stopZoneRepo;
        this.messagingTemplate = messagingTemplate;
        this.geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
    }

    /**
     * Ingere um evento de validacao. Devolve o id do ValidationEvent persistido.
     */
    @Transactional
    public Long ingest(ValidationEventDTO dto, String cardRealId, String channel,
                       String fareCategory)
    {
        OffsetDateTime now = dto.getValidatedAt() != null
            ? dto.getValidatedAt()
            : OffsetDateTime.now(ZoneOffset.UTC);

        // 1) Coroa da paragem
        short coroa = 1;
        if (dto.getStopId() != null) {
            Optional<StopZone> sz = stopZoneRepo.findByStopId(dto.getStopId());
            if (sz.isPresent()) coroa = sz.get().getCoroa();
        }

        // 2) Pseudonimo do cartao (RGPD)
        String pseudo = cardRealId != null ? pseudonymize(cardRealId) : null;

        // 3) Detecta transbordo
        Ticket ticket = null;
        boolean transfer = false;
        if (pseudo != null) {
            ticket = ticketRepo.findActiveByPseudo(pseudo, now).orElse(null);
            if (ticket != null) transfer = true;
        }

        // 4) Se nao for transbordo, cria novo ticket
        if (ticket == null) {
            ticket = new Ticket();
            ticket.setTipo(channel != null ? channel : "CARD");
            ticket.setCoroaScope(coroa);
            ticket.setValidityStart(now);
            // 1C = 1h, 2C = 1h30
            int validityMin = (coroa == 2) ? 90 : 60;
            ticket.setValidityEnd(now.plusMinutes(validityMin));
            ticket.setCardPseudoId(pseudo);
            ticket.setStatus("ACTIVE");
            ticket.setFareCategory(fareCategory != null ? fareCategory : "NORMAL");
            ticket = ticketRepo.save(ticket);
        }

        // 5) Persiste o ValidationEvent
        ValidationEvent ev = new ValidationEvent();
        ev.setTicketId(ticket.getId());
        ev.setEventType(dto.getEventType() != null ? dto.getEventType() : "TAP");
        ev.setBusId(dto.getBusId());
        ev.setRouteId(dto.getRouteId());
        ev.setStopId(dto.getStopId());
        ev.setValidatedAt(now);
        ev.setSource(dto.getSource() != null ? dto.getSource() : channel);
        if (dto.getLatitude() != null && dto.getLongitude() != null) {
            Point p = geometryFactory.createPoint(new Coordinate(dto.getLongitude(), dto.getLatitude()));
            ev.setLocation(p);
        }
        // raw_payload marca transbordo para o dashboard distinguir.
        if (transfer) ev.setRawPayload("{\"transfer\":true}");
        ev = veRepo.save(ev);

        // 6) Broadcast STOMP
        try {
            messagingTemplate.convertAndSend("/topic/ticketing", (Object) java.util.Map.of(
                "eventId",   ev.getId(),
                "ticketId",  ticket.getId(),
                "channel",   ticket.getTipo(),
                "category",  ticket.getFareCategory(),
                "coroa",     coroa,
                "transfer",  transfer,
                "validatedAt", ev.getValidatedAt().toString(),
                "busId",     ev.getBusId() == null ? "" : ev.getBusId(),
                "routeId",   ev.getRouteId() == null ? 0 : ev.getRouteId()
            ));
        } catch (Exception ignored) { /* nao parte a ingestao */ }

        log.info("[VAL] event={} ticket={} channel={} coroa={} transfer={} cat={}",
            ev.getId(), ticket.getId(), ticket.getTipo(), coroa, transfer,
            ticket.getFareCategory());
        return ev.getId();
    }

    /** Procura preco no tarifario para canal/coroas/categoria/data. */
    public Optional<FareConfig> lookupFare(String channel, short coroas,
                                           String category, LocalDate at)
    {
        return fareRepo.findApplicable(channel, coroas,
            category == null ? "NORMAL" : category,
            at == null ? LocalDate.now() : at);
    }

    /** SHA-256(cardReal || salt) hex. RGPD: pseudonimizacao estavel. */
    private String pseudonymize(String cardReal)
    {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest((cardReal + ticketSalt).getBytes());
            StringBuilder sb = new StringBuilder(64);
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            log.warn("Falha SHA-256: {}", e.getMessage());
            return null;
        }
    }
}
