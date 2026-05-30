package dai.tub.pgu.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.dto.ValidationEventDTO;

/**
 * Sprint 2 (FUNDACAO de bilhetica): stub de ingestao de eventos de validacao.
 *
 * <p>{@code POST /api/v1/validations} aceita um evento (TAP / CHECK_IN /
 * CHECK_OUT) e, nesta fase, APENAS faz {@code log.info(...)} com o conteudo.
 * NAO persiste e NAO processa: e' so a fundacao. O Sprint 5 e que ingere de
 * facto (valida o titulo, apura coroas e preco, agrega transbordos) e grava
 * em {@code validation_event}.
 *
 * <p>Devolve {@code 202 Accepted} (evento aceite para processamento futuro).
 *
 * <p>O matcher de seguranca de {@code /api/v1/validations} ja esta definido no
 * {@code SecurityConfig} (POST permitAll, para o ingestor externo).
 */
@RestController
@RequestMapping("/api/v1/validations")
public class ValidationController
{
    private static final Logger log = LoggerFactory.getLogger(ValidationController.class);

    /**
     * Recebe um evento de validacao e regista-o no log (sem persistir).
     *
     * @param dto payload do evento (canal, linha, paragem, hora, etc.)
     * @return 202 Accepted (sem corpo)
     */
    @PostMapping
    public ResponseEntity<Void> ingest(@RequestBody ValidationEventDTO dto)
    {
        // FUNDACAO: so log. NAO persiste, NAO processa (ver Sprint 5).
        log.info("Validacao recebida (stub, nao persistida): eventType={}, source={}, "
                + "ticketId={}, busId={}, routeId={}, stopId={}, validatedAt={}, "
                + "lat={}, lon={}",
                dto.getEventType(), dto.getSource(), dto.getTicketId(), dto.getBusId(),
                dto.getRouteId(), dto.getStopId(), dto.getValidatedAt(),
                dto.getLatitude(), dto.getLongitude());

        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }
}
