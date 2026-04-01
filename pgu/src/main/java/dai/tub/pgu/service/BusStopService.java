package dai.tub.pgu.service;

import java.util.List;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.BusStop;
import dai.tub.pgu.dto.BusStopDTO;
import dai.tub.pgu.repository.BusStopRepository;

@Service
public class BusStopService
{
    private final BusStopRepository busStopRepository;
    private final GeometryFactory geometryFactory;

    public BusStopService(BusStopRepository busStopRepository)
    {
        this.busStopRepository = busStopRepository;
        this.geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
    }

    public List<BusStopDTO> getAll()
    {
        return busStopRepository.findAll().stream().map(this::toDTO).toList();
    }

    public BusStopDTO getById(Long id)
    {
        BusStop stop = busStopRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Paragem não encontrada: " + id));
        return toDTO(stop);
    }

    public BusStopDTO create(BusStopDTO dto)
    {
        BusStop stop = new BusStop();
        stop.setName(dto.getName());
        stop.setCode(dto.getCode());
        stop.setMaxBusesDisplay(dto.getMaxBusesDisplay() != null ? dto.getMaxBusesDisplay() : 3);
        stop.setPanelMessage(dto.getPanelMessage());
        stop.setLocation(geometryFactory.createPoint(new Coordinate(dto.getLongitude(), dto.getLatitude())));

        return toDTO(busStopRepository.save(stop));
    }

    public BusStopDTO update(Long id, BusStopDTO dto)
    {
        BusStop stop = busStopRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Paragem não encontrada: " + id));

        if (dto.getName() != null) stop.setName(dto.getName());
        if (dto.getCode() != null) stop.setCode(dto.getCode());
        if (dto.getMaxBusesDisplay() != null) stop.setMaxBusesDisplay(dto.getMaxBusesDisplay());
        if (dto.getPanelMessage() != null) stop.setPanelMessage(dto.getPanelMessage());
        if (dto.getLatitude() != null && dto.getLongitude() != null)
            stop.setLocation(geometryFactory.createPoint(new Coordinate(dto.getLongitude(), dto.getLatitude())));

        return toDTO(busStopRepository.save(stop));
    }

    public void delete(Long id)
    {
        busStopRepository.deleteById(id);
    }

    private BusStopDTO toDTO(BusStop entity)
    {
        BusStopDTO dto = new BusStopDTO();
        dto.setId(entity.getId());
        dto.setName(entity.getName());
        dto.setCode(entity.getCode());
        dto.setMaxBusesDisplay(entity.getMaxBusesDisplay());
        dto.setPanelMessage(entity.getPanelMessage());
        if (entity.getLocation() != null)
        {
            dto.setLongitude(entity.getLocation().getX());
            dto.setLatitude(entity.getLocation().getY());
        }
        return dto;
    }
}
