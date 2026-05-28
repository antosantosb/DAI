package dai.tub.pgu.service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.Driver;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.dto.BusDTO;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.DriverBusAssignmentRepository;
import dai.tub.pgu.repository.DriverRepository;
import dai.tub.pgu.repository.RouteRepository;

@Service
public class BusService
{
    private final BusRepository busRepository;
    private final RouteRepository routeRepository;
    private final DriverBusAssignmentRepository assignmentRepository;
    private final DriverRepository driverRepository;

    public BusService(BusRepository busRepository, RouteRepository routeRepository,
                      DriverBusAssignmentRepository assignmentRepository,
                      DriverRepository driverRepository)
    {
        this.busRepository = busRepository;
        this.routeRepository = routeRepository;
        this.assignmentRepository = assignmentRepository;
        this.driverRepository = driverRepository;
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

    public BusDTO getByCode(String busCode)
    {
        Bus bus = busRepository.findByBusCode(busCode)
                .orElseThrow(() -> new RuntimeException("Autocarro não encontrado: " + busCode));
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
        if (dto.getStatus() != null) {
            // Regra de negócio: autocarro só pode ir para ACTIVE se tiver motorista atribuído
            if ("ACTIVE".equals(dto.getStatus()) && !"ACTIVE".equals(bus.getStatus())) {
                boolean hasDriver = assignmentRepository.findByBusIdAndActiveTrue(bus.getId()).isPresent();
                if (!hasDriver) {
                    throw new RuntimeException("Não é possível ativar o autocarro " + bus.getBusCode()
                            + " sem motorista atribuído. Atribua um motorista primeiro em Motoristas.");
                }
                // Reset lastSync ao reativar — saúde da rede começa limpa
                bus.setLastSync(null);
            }
            bus.setStatus(dto.getStatus());
        }
        if (dto.getRouteId() != null)
        {
            Route route = routeRepository.findById(dto.getRouteId())
                    .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + dto.getRouteId()));
            bus.setRoute(route);
        }

        return toDTO(busRepository.save(bus));
    }

    public List<BusDTO> createBatch(int count)
    {
        List<Route> routes = routeRepository.findAll();
        if (routes.isEmpty()) {
            throw new RuntimeException("Não existem rotas para atribuir aos autocarros.");
        }

        // Encontrar o maior número de bus code existente
        int maxNum = busRepository.findAll().stream()
            .map(b -> b.getBusCode().replaceAll("\\D", ""))
            .filter(s -> !s.isEmpty())
            .mapToInt(Integer::parseInt)
            .max()
            .orElse(0);

        ThreadLocalRandom rng = ThreadLocalRandom.current();
        List<BusDTO> created = new ArrayList<>();

        for (int i = 1; i <= count; i++) {
            int num = maxNum + i;
            Bus bus = new Bus();
            bus.setBusCode("TUB-" + String.format("%03d", num));
            bus.setLicensePlate(randomPlate(rng));
            bus.setCapacity(rng.nextInt(30, 61)); // 30-60
            bus.setRoute(routes.get(rng.nextInt(routes.size())));
            // status default = STOPPED (definido na entidade)

            created.add(toDTO(busRepository.save(bus)));
        }

        return created;
    }

    private String randomPlate(ThreadLocalRandom rng)
    {
        String letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        String digits = "0123456789";
        return "" + letters.charAt(rng.nextInt(26)) + letters.charAt(rng.nextInt(26))
             + "-" + digits.charAt(rng.nextInt(10)) + digits.charAt(rng.nextInt(10))
             + "-" + letters.charAt(rng.nextInt(26)) + letters.charAt(rng.nextInt(26));
    }

    /**
     * Apaga um autocarro. Antes do delete, desativa qualquer assignment
     * activa para evitar deixar o motorista "agarrado" a um bus fantasma.
     *
     * <p>Sprint 1 follow-up: sem isto, ao descomissionar um autocarro que
     * tinha motorista assigned, o driver continuava com status ON_DUTY e a
     * tabela `driver_assignments` ficava com uma linha activa que apontava
     * para um bus.id inexistente (a UI mostrava "M-008 / On duty" sem o
     * autocarro existir).
     */
    @Transactional
    public void delete(Long id)
    {
        assignmentRepository.findByBusIdAndActiveTrue(id)
            .ifPresent(assignment -> {
                Driver driver = assignment.getDriver();
                if (driver != null) {
                    driver.setStatus("AVAILABLE");
                    driverRepository.save(driver);
                }
                assignment.deactivate();
                assignmentRepository.save(assignment);
            });
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
