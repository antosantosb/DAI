package dai.tub.pgu.service;

import java.util.List;

import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.dto.BusDTO;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.RouteRepository;

@Service
public class BusService
{
    private final BusRepository busRepository;
    private final RouteRepository routeRepository;

    public BusService(BusRepository busRepository, RouteRepository routeRepository)
    {
        this.busRepository = busRepository;
        this.routeRepository = routeRepository;
    }

    public List<BusDTO> getAll()
    {
        return busRepository.findAll().stream().map(this::toDTO).toList();
    }

    public BusDTO getById(Long id)
    {
        Bus bus = busRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Autocarro não encontrado: " + id));
        return toDTO(bus);
    }

    public BusDTO create(BusDTO dto)
    {
        Bus bus = new Bus();
        bus.setBusCode(dto.getBusCode());
        bus.setLicensePlate(dto.getLicensePlate());
        bus.setCapacity(dto.getCapacity());

        if (dto.getRouteId() != null)
        {
            Route route = routeRepository.findById(dto.getRouteId())
                    .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + dto.getRouteId()));
            bus.setRoute(route);
        }

        return toDTO(busRepository.save(bus));
    }

    public BusDTO update(Long id, BusDTO dto)
    {
        Bus bus = busRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Autocarro não encontrado: " + id));

        if (dto.getBusCode() != null) bus.setBusCode(dto.getBusCode());
        if (dto.getLicensePlate() != null) bus.setLicensePlate(dto.getLicensePlate());
        if (dto.getCapacity() != null) bus.setCapacity(dto.getCapacity());
        if (dto.getStatus() != null) bus.setStatus(dto.getStatus());
        if (dto.getRouteId() != null)
        {
            Route route = routeRepository.findById(dto.getRouteId())
                    .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + dto.getRouteId()));
            bus.setRoute(route);
        }

        return toDTO(busRepository.save(bus));
    }

    public void delete(Long id)
    {
        busRepository.deleteById(id);
    }

    private BusDTO toDTO(Bus entity)
    {
        BusDTO dto = new BusDTO();
        dto.setId(entity.getId());
        dto.setBusCode(entity.getBusCode());
        dto.setLicensePlate(entity.getLicensePlate());
        dto.setCapacity(entity.getCapacity());
        if (entity.getRoute() != null)
        {
            dto.setRouteId(entity.getRoute().getId());
            dto.setRouteCode(entity.getRoute().getCode());
            dto.setRouteName(entity.getRoute().getName());
        }
        dto.setStatus(entity.getStatus());
        return dto;
    }
}
