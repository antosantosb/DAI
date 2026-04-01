package dai.tub.pgu.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.BusStop;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.domain.RouteStop;
import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.dto.StopEtaDTO;
import dai.tub.pgu.dto.StopPanelDTO;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.BusStopRepository;
import dai.tub.pgu.repository.RouteStopRepository;
import dai.tub.pgu.repository.TelemetryRepository;

@Service
public class StopPanelService
{
    private static final Logger log = LoggerFactory.getLogger(StopPanelService.class);
    private static final double DEFAULT_SPEED_KMH = 25.0;
    private static final double DWELL_TIME_SECONDS = 30.0; // tempo parado por paragem

    private final BusStopRepository stopRepo;
    private final RouteStopRepository routeStopRepo;
    private final BusRepository busRepo;
    private final TelemetryRepository telemetryRepo;
    private final OsrmService osrmService;

    public StopPanelService(BusStopRepository stopRepo, RouteStopRepository routeStopRepo,
                            BusRepository busRepo, TelemetryRepository telemetryRepo,
                            OsrmService osrmService)
    {
        this.stopRepo = stopRepo;
        this.routeStopRepo = routeStopRepo;
        this.busRepo = busRepo;
        this.telemetryRepo = telemetryRepo;
        this.osrmService = osrmService;
    }

    public StopPanelDTO getPanel(Long stopId)
    {
        BusStop stop = stopRepo.findById(stopId)
            .orElseThrow(() -> new RuntimeException("Paragem nao encontrada: " + stopId));

        double stopLat = stop.getLocation().getY();
        double stopLon = stop.getLocation().getX();
        int maxDisplay = stop.getMaxBusesDisplay() != null ? stop.getMaxBusesDisplay() : 3;

        // Encontrar todas as rotas que passam por esta paragem
        List<RouteStop> routeStops = routeStopRepo.findByStopId(stopId);

        List<StopEtaDTO> allEtas = new ArrayList<>();

        for (RouteStop rs : routeStops)
        {
            Route route = rs.getRoute();
            int stopOrder = rs.getStopOrder();
            int totalStops = route.getRouteStops().size();

            // Buscar autocarros ativos nesta rota
            List<Bus> activeBuses = busRepo.findByRouteIdAndStatus(route.getId(), "ACTIVE");

            for (Bus bus : activeBuses)
            {
                VehicleTelemetry latest = telemetryRepo.findLatestByBusId(bus.getBusCode());
                if (latest == null || latest.getLocation() == null) continue;

                // Verificar se o autocarro ainda nao passou desta paragem
                Integer stopsRemaining = latest.getStopsRemaining();
                if (stopsRemaining == null) continue;

                // Posicao atual do autocarro na rota (indice baseado em 1)
                int busCurrentOrder = totalStops - stopsRemaining;
                if (busCurrentOrder >= stopOrder) continue; // ja passou

                // Calcular ETA via OSRM
                double busLat = latest.getLocation().getY();
                double busLon = latest.getLocation().getX();

                double distMeters = osrmService.getDistance(busLat, busLon, stopLat, stopLon);
                if (distMeters < 0)
                {
                    // Fallback: distancia em linha reta * 1.4
                    distMeters = haversineMeters(busLat, busLon, stopLat, stopLon) * 1.4;
                }

                double speedKmh = (latest.getSpeedKmh() != null && latest.getSpeedKmh() > 0)
                    ? latest.getSpeedKmh() : DEFAULT_SPEED_KMH;

                // Numero de paragens intermedias entre o autocarro e esta paragem
                int intermediateStops = stopOrder - busCurrentOrder - 1;
                if (intermediateStops < 0) intermediateStops = 0;

                // ETA = tempo de viagem + tempo parado nas paragens intermedias
                double travelMinutes = (distMeters / 1000.0) / speedKmh * 60.0;
                double dwellMinutes = intermediateStops * DWELL_TIME_SECONDS / 60.0;
                int etaMinutes = (int) Math.ceil(travelMinutes + dwellMinutes);
                if (etaMinutes < 1) etaMinutes = 1;

                allEtas.add(new StopEtaDTO(
                    route.getCode(),
                    route.getColor() != null ? route.getColor() : "#6366f1",
                    bus.getBusCode(),
                    etaMinutes
                ));
            }
        }

        // Ordenar por ETA e limitar ao maxDisplay
        allEtas.sort(Comparator.comparingInt(StopEtaDTO::getEtaMinutes));
        List<StopEtaDTO> displayEtas = allEtas.size() > maxDisplay
            ? allEtas.subList(0, maxDisplay) : allEtas;

        StopPanelDTO panel = new StopPanelDTO();
        panel.setStopId(stop.getId());
        panel.setStopName(stop.getName());
        panel.setStopCode(stop.getCode());
        panel.setPanelMessage(stop.getPanelMessage());
        panel.setEtas(displayEtas);

        return panel;
    }

    private double haversineMeters(double lat1, double lon1, double lat2, double lon2)
    {
        double R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
