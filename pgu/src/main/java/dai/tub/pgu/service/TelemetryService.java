package dai.tub.pgu.service;

import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.List;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.dto.BusHealthDTO;
import dai.tub.pgu.mapper.TelemetryMapper;
import dai.tub.pgu.repository.TelemetryRepository;
import dai.tub.pgu.repository.BusRepository;
import java.time.Duration;

@Service
public class TelemetryService 
{
    private final TelemetryRepository telemetryRepository;
    private final BusRepository busRepository;
    private final GeometryFactory geometryFactory;

    public TelemetryService(TelemetryRepository telemetryRepository, BusRepository busRepository)
    {
        this.telemetryRepository = telemetryRepository;
        this.busRepository = busRepository;
        // SRID 4326 é o standard WGS84 (usado pelo GPS e Google Maps)
        this.geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
    }

    public void processAndSaveTelemetry(TelemetryDTO dto)
    {
        Coordinate coordinate = new Coordinate(dto.getLongitude(), dto.getLatitude());
        Point location = geometryFactory.createPoint(coordinate);

        VehicleTelemetry entity = new VehicleTelemetry();
        entity.setBusId(dto.getBusId());
        entity.setLocation(location);
        entity.setPassengers(dto.getPassengers());
        entity.setSpeedKmh(dto.getSpeed());
        entity.setRecordedAt(dto.getTimestamp() != null ? dto.getTimestamp() : Instant.now());
        entity.setStatus(dto.getStatus() != null ? dto.getStatus() : "unknown");
        entity.setNextStop(dto.getNextStop());
        entity.setStopsRemaining(dto.getStopsRemaining());

        telemetryRepository.save(entity);

        // Update the bus last sync time
        busRepository.findByBusCode(dto.getBusId()).ifPresent(bus -> {
            bus.setLastSync(Instant.now());
            busRepository.save(bus);
        });
    }

    public List<TelemetryDTO> getAllTelemetry()
    {
        List<VehicleTelemetry> entities = telemetryRepository.findAll();

        return entities.stream().map(TelemetryMapper::fromEntity).toList();
    }

    public List<TelemetryDTO> getLatestPerBus()
    {
        return telemetryRepository.findLatestPerBus()
            .stream().map(TelemetryMapper::fromEntity).toList();
    }

    public List<BusHealthDTO> getBusHealthStatuses()
    {
        List<Bus> buses = busRepository.findAll();
        Instant now = Instant.now();

        return buses.stream().map(bus -> {
            String status = "No Data";
            if (bus.getLastSync() != null) {
                long minutes = Duration.between(bus.getLastSync(), now).toMinutes();
                if (minutes < 1) {
                    status = "Good Performance";
                } else if (minutes < 60) {
                    status = "Partial Information";
                }
            }
            int dummyUptime = 99; // Placeholder to maintain the 99% UI progress bar
            return new BusHealthDTO(bus.getBusCode(), bus.getLastSync(), status, dummyUptime);
        }).toList();
    }
}
