package dai.tub.pgu.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.domain.BusStop;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.domain.RouteStop;
import dai.tub.pgu.dto.RouteDTO;
import dai.tub.pgu.dto.RouteStopDTO;
import dai.tub.pgu.repository.BusStopRepository;
import dai.tub.pgu.repository.RouteRepository;

@Service
public class RouteService
{
    private final RouteRepository routeRepository;
    private final BusStopRepository busStopRepository;

    public RouteService(RouteRepository routeRepository, BusStopRepository busStopRepository)
    {
        this.routeRepository = routeRepository;
        this.busStopRepository = busStopRepository;
    }

    public List<RouteDTO> getAll()
    {
        return routeRepository.findAll().stream().map(this::toDTO).toList();
    }

    public RouteDTO getById(Long id)
    {
        Route route = routeRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + id));
        return toDTO(route);
    }

    @Transactional
    public RouteDTO create(RouteDTO dto)
    {
        Route route = new Route();
        route.setName(dto.getName());
        route.setCode(dto.getCode());
        route.setColor(dto.getColor());

        if (dto.getStops() != null)
        {
            for (RouteStopDTO rsDto : dto.getStops())
            {
                BusStop stop = busStopRepository.findById(rsDto.getStopId())
                        .orElseThrow(() -> new RuntimeException("Paragem não encontrada: " + rsDto.getStopId()));
                RouteStop rs = new RouteStop();
                rs.setRoute(route);
                rs.setStop(stop);
                rs.setStopOrder(rsDto.getStopOrder());
                route.getRouteStops().add(rs);
            }
        }

        return toDTO(routeRepository.save(route));
    }

    @Transactional
    public RouteDTO update(Long id, RouteDTO dto)
    {
        Route route = routeRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + id));

        if (dto.getName() != null) route.setName(dto.getName());
        if (dto.getCode() != null) route.setCode(dto.getCode());
        if (dto.getColor() != null) route.setColor(dto.getColor());

        if (dto.getStops() != null)
        {
            route.getRouteStops().clear();
            for (RouteStopDTO rsDto : dto.getStops())
            {
                BusStop stop = busStopRepository.findById(rsDto.getStopId())
                        .orElseThrow(() -> new RuntimeException("Paragem não encontrada: " + rsDto.getStopId()));
                RouteStop rs = new RouteStop();
                rs.setRoute(route);
                rs.setStop(stop);
                rs.setStopOrder(rsDto.getStopOrder());
                route.getRouteStops().add(rs);
            }
        }

        return toDTO(routeRepository.save(route));
    }

    public void delete(Long id)
    {
        routeRepository.deleteById(id);
    }

    private RouteDTO toDTO(Route entity)
    {
        RouteDTO dto = new RouteDTO();
        dto.setId(entity.getId());
        dto.setName(entity.getName());
        dto.setCode(entity.getCode());
        dto.setColor(entity.getColor());
        dto.setStops(entity.getRouteStops().stream().map(this::toRouteStopDTO).toList());
        return dto;
    }

    private RouteStopDTO toRouteStopDTO(RouteStop rs)
    {
        RouteStopDTO dto = new RouteStopDTO();
        dto.setStopId(rs.getStop().getId());
        dto.setStopName(rs.getStop().getName());
        dto.setStopCode(rs.getStop().getCode());
        dto.setStopOrder(rs.getStopOrder());
        if (rs.getStop().getLocation() != null)
        {
            dto.setLongitude(rs.getStop().getLocation().getX());
            dto.setLatitude(rs.getStop().getLocation().getY());
        }
        return dto;
    }
}
