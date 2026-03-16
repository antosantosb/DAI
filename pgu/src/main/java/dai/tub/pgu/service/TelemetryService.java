package dai.tub.pgu.service;

import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.List;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.dto.TelemetryDTO;
import dai.tub.pgu.mapper.TelemetryMapper;
import dai.tub.pgu.repository.TelemetryRepository;

@Service
public class TelemetryService 
{
    private final TelemetryRepository telemetryRepository;
    private final GeometryFactory geometryFactory;

    public TelemetryService(TelemetryRepository telemetryRepository)
    {
        this.telemetryRepository = telemetryRepository;
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
        entity.setSpeedKmh(dto.getSpeed());
        entity.setRecordedAt(dto.getTimesptamp() != null ? dto.getTimesptamp() : Instant.now());

        telemetryRepository.save(entity);
    }

    public List<TelemetryDTO> getAllTelemetry()
    {
        List<VehicleTelemetry> entities = telemetryRepository.findAll();

        return entities.stream().map(TelemetryMapper::fromEntity).toList();
    }
}
