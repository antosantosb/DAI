package dai.tub.pgu.controller;

import java.util.concurrent.TimeUnit;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.google.transit.realtime.GtfsRealtime.FeedMessage;

import dai.tub.pgu.service.GtfsRtService;

/**
 * Sprint 1 (F7): feed GTFS-Realtime (R.IVT.01/04/07).
 *
 * <p>Endpoints publicos (permitAll em SecurityConfig) que devolvem protobuf
 * binario (Content-Type application/x-protobuf) para consumo por apps de
 * transporte (Google Maps, Transit, Citymapper) e agregadores.
 *
 * <p>O controller e' fino: toda a construcao (e cache de 30s) vive em
 * {@link GtfsRtService}. Acrescentamos Cache-Control: max-age=30 alinhado
 * com o TTL das caches "gtfs-rt-vp" / "gtfs-rt-tu".
 */
@RestController
@RequestMapping("/api/v1/gtfs-rt")
public class GtfsRtController
{
    /** Tipo MIME oficial para payloads protobuf GTFS-Realtime. */
    private static final String PROTOBUF = "application/x-protobuf";

    private final GtfsRtService gtfsRtService;

    public GtfsRtController(GtfsRtService gtfsRtService)
    {
        this.gtfsRtService = gtfsRtService;
    }

    /**
     * Posicoes de veiculos em tempo real (ultimos ~5 min, ultima leitura/bus).
     */
    @GetMapping(value = "/vehicle-positions.pb", produces = PROTOBUF)
    public ResponseEntity<byte[]> vehiclePositions()
    {
        FeedMessage feed = gtfsRtService.buildVehiclePositions();
        return protobuf(feed);
    }

    /**
     * Trip updates (melhor-esforco a partir do horario planeado de hoje +
     * atraso estimado por rota). Ver GtfsRtService para a limitacao conhecida.
     */
    @GetMapping(value = "/trip-updates.pb", produces = PROTOBUF)
    public ResponseEntity<byte[]> tripUpdates()
    {
        FeedMessage feed = gtfsRtService.buildTripUpdates();
        return protobuf(feed);
    }

    private static ResponseEntity<byte[]> protobuf(FeedMessage feed)
    {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(PROTOBUF))
                .cacheControl(CacheControl.maxAge(30, TimeUnit.SECONDS).cachePublic())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .body(feed.toByteArray());
    }
}
