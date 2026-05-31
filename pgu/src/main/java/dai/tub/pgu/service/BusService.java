package dai.tub.pgu.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.BusDuty;
import dai.tub.pgu.domain.Driver;
import dai.tub.pgu.domain.Route;
import dai.tub.pgu.dto.BusDTO;
import dai.tub.pgu.repository.BusDutyRepository;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.DriverBusAssignmentRepository;
import dai.tub.pgu.repository.DriverRepository;
import dai.tub.pgu.repository.RouteRepository;
import dai.tub.pgu.repository.VehicleSensorRepository;

@Service
public class BusService
{
    private static final Logger log = LoggerFactory.getLogger(BusService.class);

    // Estados do autocarro (Fase E).
    // Estados validos: STOPPED | EM_SERVICO | STOPPING | DECOMMISSIONED.
    private static final String STATUS_STOPPED         = "STOPPED";
    private static final String STATUS_EM_SERVICO      = "EM_SERVICO";
    private static final String STATUS_STOPPING        = "STOPPING";
    private static final String STATUS_DECOMMISSIONED  = "DECOMMISSIONED";
    // Fase final (#STARTING): deadhead da central ate' a 1a paragem.
    private static final String STATUS_STARTING        = "STARTING";
    // Legacy: 'ACTIVE' = 'EM_SERVICO' (compat com chamadas antigas no update()).
    private static final String STATUS_LEGACY_ACTIVE   = "ACTIVE";

    private static final ZoneId ZONE_LISBON = ZoneId.of("Europe/Lisbon");

    private final BusRepository busRepository;
    private final RouteRepository routeRepository;
    private final DriverBusAssignmentRepository assignmentRepository;
    private final DriverRepository driverRepository;
    private final VehicleSensorRepository vehicleSensorRepository;
    private final BusDutyRepository busDutyRepository;

    public BusService(BusRepository busRepository, RouteRepository routeRepository,
                      DriverBusAssignmentRepository assignmentRepository,
                      DriverRepository driverRepository,
                      VehicleSensorRepository vehicleSensorRepository,
                      BusDutyRepository busDutyRepository)
    {
        this.busRepository = busRepository;
        this.routeRepository = routeRepository;
        this.assignmentRepository = assignmentRepository;
        this.driverRepository = driverRepository;
        this.vehicleSensorRepository = vehicleSensorRepository;
        this.busDutyRepository = busDutyRepository;
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
        // Sprint 4: powertrain (default DIESEL) + condicionais.
        if (dto.getPowertrain() != null) bus.setPowertrain(dto.getPowertrain());
        applyPowertrainFields(bus, dto);

        return toDTO(busRepository.save(bus));
    }

    /** Sprint 4: aplica campos condicionais do powertrain (DTO -> entity).
     *  Usa java.math.BigDecimal para precisao. Tolera valores ausentes. */
    private void applyPowertrainFields(Bus bus, BusDTO dto)
    {
        if (dto.getFuelTankL()     != null) bus.setFuelTankL(java.math.BigDecimal.valueOf(dto.getFuelTankL()));
        if (dto.getAdblueTankL()   != null) bus.setAdblueTankL(java.math.BigDecimal.valueOf(dto.getAdblueTankL()));
        if (dto.getBatteryKwh()    != null) bus.setBatteryKwh(java.math.BigDecimal.valueOf(dto.getBatteryKwh()));
        if (dto.getChargingType()  != null) bus.setChargingType(dto.getChargingType());
        if (dto.getCngTankKg()     != null) bus.setCngTankKg(java.math.BigDecimal.valueOf(dto.getCngTankKg()));
        if (dto.getCngNominalBar() != null) bus.setCngNominalBar(java.math.BigDecimal.valueOf(dto.getCngNominalBar()));
    }

    @Transactional
    public BusDTO update(Long id, BusDTO dto)
    {
        Bus bus = busRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Autocarro não encontrado: " + id));

        if (dto.getBusCode() != null) bus.setBusCode(dto.getBusCode());
        if (dto.getLicensePlate() != null) bus.setLicensePlate(dto.getLicensePlate());
        if (dto.getCapacity() != null) bus.setCapacity(dto.getCapacity());
        if (dto.getStatus() != null) {
            String requested = dto.getStatus();
            // Fase E (E-back-2): a transicao para "em servico" (legacy ACTIVE
            // ou EM_SERVICO) passa pelos 4 gates de startService(). Delegamos
            // para manter uma unica fonte de verdade e mensagens consistentes.
            boolean isActivation =
                    (STATUS_LEGACY_ACTIVE.equals(requested) || STATUS_EM_SERVICO.equals(requested))
                    && !STATUS_EM_SERVICO.equals(bus.getStatus())
                    && !STATUS_LEGACY_ACTIVE.equals(bus.getStatus());
            if (isActivation) {
                // Persiste os campos editaveis antes de delegar (o startService
                // faz save no final). Os campos abaixo nao alteram o gating.
                if (dto.getRouteId() != null) {
                    Route route = routeRepository.findById(dto.getRouteId())
                            .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + dto.getRouteId()));
                    bus.setRoute(route);
                }
                busRepository.save(bus);
                return startService(id);
            }
            // Restantes transicoes manuais via update (ex.: STOPPED, STOPPING,
            // DECOMMISSIONED): aplicamos sem gating extra (admin-only via security).
            bus.setStatus(requested);
        }
        if (dto.getRouteId() != null)
        {
            Route route = routeRepository.findById(dto.getRouteId())
                    .orElseThrow(() -> new RuntimeException("Rota não encontrada: " + dto.getRouteId()));
            bus.setRoute(route);
        }
        // Sprint 4: powertrain editavel (admin via Bus CRUD).
        if (dto.getPowertrain() != null) bus.setPowertrain(dto.getPowertrain());
        applyPowertrainFields(bus, dto);

        return toDTO(busRepository.save(bus));
    }

    // ============================================================
    // Fase E (E-back-2): transicoes de estado do autocarro.
    // ============================================================

    /**
     * Iniciar Servico: STOPPED -> EM_SERVICO. Gates (ordem):
     *   1) bus existe e em STOPPED                     (404 / 409).
     *   2) tem motorista atribuido (assignment activa) (409).
     *   3) tem main sensor atribuido                   (409).
     *   4) tem escala (bus_duty) PLANNED para HOJE com planned_start > agora (409).
     *
     * Quando arranca: marca a PRIMEIRA duty PLANNED (ordem por sequence) como
     * RUNNING. Reset do lastSync.
     */
    @Transactional
    public BusDTO startService(Long busId)
    {
        Bus bus = busRepository.findById(busId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Autocarro nao encontrado: " + busId));

        if (!STATUS_STOPPED.equalsIgnoreCase(bus.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "So e' possivel iniciar servico com o autocarro em STOPPED. Estado actual: " + bus.getStatus());
        }

        // (2) motorista atribuido
        boolean hasDriver = assignmentRepository.findByBusIdAndActiveTrue(bus.getId()).isPresent();
        if (!hasDriver) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Nao e' possivel iniciar servico no autocarro " + bus.getBusCode()
                    + ": nao tem motorista atribuido. Atribua um motorista em Motoristas.");
        }

        // (3) main sensor atribuido
        boolean hasSensor = vehicleSensorRepository.existsByBusId(bus.getId());
        if (!hasSensor) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Nao e' possivel iniciar servico no autocarro " + bus.getBusCode()
                    + ": nao tem main sensor atribuido. Atribua um sensor em Sensores.");
        }

        // (4) escala de hoje com pelo menos 1 duty PLANNED com planned_start >= agora
        LocalDate today = LocalDate.now(ZONE_LISBON);
        java.time.Instant now = java.time.Instant.now();
        List<BusDuty> planned = busDutyRepository.findPlannedByBusAndDateOrderBySequence(bus.getId(), today);
        if (planned.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Nao e' possivel iniciar servico no autocarro " + bus.getBusCode()
                    + ": nao tem escala para hoje. Crie a escala em Escala.");
        }
        // Nota: nao bloqueamos arranque depois da planned_start. O modelo
        // da "Hora de partida" trata atrasos como departure_type=LATE.

        // STARTING: simulador inicia deadhead da central -> 1a paragem. A
        // promocao da 1a duty para RUNNING e a transicao para EM_SERVICO
        // acontece quando o simulador chega a 1a paragem (inServiceArrived).
        bus.setStatus(STATUS_STARTING);
        bus.setLastSync(null);
        busRepository.save(bus);

        log.info("[bus-state] startService busId={} busCode={} -> STARTING (deadhead central->1a paragem)",
                bus.getId(), bus.getBusCode());

        return toDTO(bus);
    }

    /**
     * Chamado pelo simulador quando o autocarro chega a 1a paragem da 1a
     * duty da escala. Transita STARTING -> EM_SERVICO e marca a 1a duty
     * PLANNED como RUNNING. Idempotente em EM_SERVICO/STOPPING/STOPPED.
     */
    @Transactional
    public BusDTO inServiceArrived(Long busId)
    {
        Bus bus = busRepository.findById(busId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Autocarro nao encontrado: " + busId));
        // Idempotente: ja em servico (ou fora ja') -> no-op.
        if (STATUS_EM_SERVICO.equals(bus.getStatus()) || STATUS_LEGACY_ACTIVE.equals(bus.getStatus())
            || STATUS_STOPPING.equals(bus.getStatus()) || STATUS_STOPPED.equals(bus.getStatus())) {
            return toDTO(bus);
        }
        if (!STATUS_STARTING.equals(bus.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Transicao invalida: bus " + bus.getBusCode() + " esta " + bus.getStatus() + " (esperava STARTING).");
        }
        // Promove a 1a duty PLANNED para RUNNING.
        java.time.LocalDate today = java.time.LocalDate.now(ZONE_LISBON);
        List<BusDuty> planned = busDutyRepository
                .findPlannedByBusAndDateOrderBySequence(busId, today);
        if (!planned.isEmpty()) {
            BusDuty first = planned.get(0);
            first.setStatus("RUNNING");
            first.setUpdatedAt(java.time.Instant.now());
            busDutyRepository.save(first);
        }
        bus.setStatus(STATUS_EM_SERVICO);
        busRepository.save(bus);
        log.info("[bus-state] inServiceArrived busId={} busCode={} -> EM_SERVICO", busId, bus.getBusCode());
        return toDTO(bus);
    }

    /**
     * Terminar Servico: EM_SERVICO -> STOPPING. Cancela as PLANNED restantes
     * de hoje (PLANNED -> CANCELLED) e marca a RUNNING como INTERRUPTED.
     * A transicao STOPPING -> STOPPED e' feita pelo simulador via arrived().
     */
    @Transactional
    public BusDTO endService(Long busId, String byWho)
    {
        Bus bus = busRepository.findById(busId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Autocarro nao encontrado: " + busId));

        if (!STATUS_EM_SERVICO.equalsIgnoreCase(bus.getStatus())
                && !STATUS_LEGACY_ACTIVE.equalsIgnoreCase(bus.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "So e' possivel terminar servico com o autocarro em EM_SERVICO. Estado actual: " + bus.getStatus());
        }

        LocalDate today = LocalDate.now(ZONE_LISBON);
        java.time.Instant nowTs = java.time.Instant.now();

        // Marca a duty RUNNING como INTERRUPTED.
        List<BusDuty> running = busDutyRepository.findRunningByBusAndDate(bus.getId(), today);
        for (BusDuty d : running) {
            d.setStatus("INTERRUPTED");
            d.setUpdatedAt(nowTs);
            busDutyRepository.save(d);
        }
        // Cancela as PLANNED restantes.
        List<BusDuty> planned = busDutyRepository.findPlannedByBusAndDateOrderBySequence(bus.getId(), today);
        for (BusDuty d : planned) {
            d.setStatus("CANCELLED");
            d.setUpdatedAt(nowTs);
            busDutyRepository.save(d);
        }

        bus.setStatus(STATUS_STOPPING);
        busRepository.save(bus);

        log.info("[bus-state] endService busId={} busCode={} by={} interrupted={} cancelled={}",
                bus.getId(), bus.getBusCode(), byWho == null ? "?" : byWho,
                running.size(), planned.size());

        return toDTO(bus);
    }

    /**
     * Chegou a central: STOPPING -> STOPPED. Idempotente quando ja STOPPED.
     * Chamado pelo simulador via X-API-Key.
     */
    @Transactional
    public BusDTO arrived(Long busId)
    {
        Bus bus = busRepository.findById(busId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Autocarro nao encontrado: " + busId));

        if (STATUS_STOPPED.equalsIgnoreCase(bus.getStatus())) {
            // Idempotente.
            return toDTO(bus);
        }
        if (!STATUS_STOPPING.equalsIgnoreCase(bus.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "So e' possivel marcar arrived com o autocarro em STOPPING. Estado actual: " + bus.getStatus());
        }
        bus.setStatus(STATUS_STOPPED);
        busRepository.save(bus);

        log.info("[bus-state] arrived busId={} busCode={} -> STOPPED", bus.getId(), bus.getBusCode());

        return toDTO(bus);
    }

    /**
     * Fase E (E-back-2): a escala de hoje terminou (ultima duty DONE e nao ha
     * mais PLANNED nem RUNNING). Transita EM_SERVICO -> STOPPING. Idempotente
     * quando ja STOPPING ou STOPPED.
     */
    @Transactional
    public BusDTO dutiesComplete(Long busId)
    {
        Bus bus = busRepository.findById(busId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Autocarro nao encontrado: " + busId));

        if (STATUS_STOPPING.equalsIgnoreCase(bus.getStatus())
                || STATUS_STOPPED.equalsIgnoreCase(bus.getStatus())) {
            return toDTO(bus); // idempotente
        }
        if (!STATUS_EM_SERVICO.equalsIgnoreCase(bus.getStatus())
                && !STATUS_LEGACY_ACTIVE.equalsIgnoreCase(bus.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Auto-STOPPING so' a partir de EM_SERVICO. Estado actual: " + bus.getStatus());
        }

        LocalDate today = LocalDate.now(ZONE_LISBON);
        List<BusDuty> planned = busDutyRepository.findPlannedByBusAndDateOrderBySequence(bus.getId(), today);
        List<BusDuty> running = busDutyRepository.findRunningByBusAndDate(bus.getId(), today);
        if (!planned.isEmpty() || !running.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ainda existem duties por concluir na escala de hoje (planned=" + planned.size()
                    + ", running=" + running.size() + ").");
        }

        bus.setStatus(STATUS_STOPPING);
        busRepository.save(bus);

        log.info("[bus-state] dutiesComplete busId={} busCode={} -> STOPPING",
                bus.getId(), bus.getBusCode());

        return toDTO(bus);
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
    /**
     * Descomissionar (soft-delete): em vez de apagar a linha (que rebenta FKs
     * historicas como ocorrencias/telemetria/driver_bus_assignments e ainda
     * pode falhar por escala/sensor atribuido), marca o autocarro como
     * DECOMMISSIONED e liberta os recursos:
     *   * libertar main sensor (vehicle_sensor.bus_id = NULL)
     *   * desactivar driver assignment activa (driver volta a AVAILABLE)
     *   * status -> DECOMMISSIONED (terminal)
     * As bus_duty da escala ficam, mas sem efeito porque o bus deixa de operar.
     * Idempotente: descomissionar um bus ja descomissionado e' no-op.
     */
    @Transactional
    public void delete(Long id)
    {
        Bus bus = busRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Autocarro nao encontrado: " + id));

        if (STATUS_DECOMMISSIONED.equals(bus.getStatus())) {
            return; // ja descomissionado: nada a fazer
        }

        // So' STOPPED pode ser descomissionado. Bloqueia EM_SERVICO/STOPPING.
        if (!STATUS_STOPPED.equals(bus.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "O autocarro " + bus.getBusCode() + " tem de estar parado (STOPPED) antes de ser descomissionado.");
        }

        // Liberta sensor(es) atribuido(s): apos a V51 ha no maximo 1, mas
        // findByBusId devolve List (defensivo). Iteramos e libertamos todos.
        for (var s : vehicleSensorRepository.findByBusId(id)) {
            s.setBusId(null);
            vehicleSensorRepository.save(s);
        }

        // Desactiva driver assignment activa (driver volta a AVAILABLE).
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

        // Marca como descomissionado (terminal). Nao apaga a linha para
        // preservar referencias historicas (telemetria, ocorrencias, escalas).
        bus.setStatus(STATUS_DECOMMISSIONED);
        bus.setDecommissionedAt(java.time.Instant.now());
        busRepository.save(bus);
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
        dto.setDecommissionedAt(entity.getDecommissionedAt());
        // Sprint 4 (3.2): powertrain + campos condicionais.
        dto.setPowertrain(entity.getPowertrain());
        if (entity.getFuelTankL()     != null) dto.setFuelTankL(entity.getFuelTankL().doubleValue());
        if (entity.getAdblueTankL()   != null) dto.setAdblueTankL(entity.getAdblueTankL().doubleValue());
        if (entity.getBatteryKwh()    != null) dto.setBatteryKwh(entity.getBatteryKwh().doubleValue());
        dto.setChargingType(entity.getChargingType());
        if (entity.getCngTankKg()     != null) dto.setCngTankKg(entity.getCngTankKg().doubleValue());
        if (entity.getCngNominalBar() != null) dto.setCngNominalBar(entity.getCngNominalBar().doubleValue());

        // Linha actual derivada da escala (1a duty PLANNED/RUNNING de hoje).
        // Permite ao frontend mostrar "Linha 2 · Bom Jesus" mesmo quando o
        // autocarro nao tem `route` directa (linha vem da trip da escala).
        try {
            java.time.LocalDate today = java.time.LocalDate.now(ZONE_LISBON);
            List<BusDuty> dayDuties = busDutyRepository.findByBusIdAndServiceDateOrderBySequence(entity.getId(), today);
            // Prefere a duty RUNNING (a trip a decorrer); fallback para a
            // proxima PLANNED. A escala pode misturar varias linhas durante
            // o dia, por isso e' importante NAO devolver a primeira PLANNED
            // se ja' ha uma RUNNING (que pode ser de outra linha).
            BusDuty picked = null;
            for (BusDuty d : dayDuties) {
                if ("RUNNING".equals(d.getStatus())) { picked = d; break; }
            }
            if (picked == null) {
                for (BusDuty d : dayDuties) {
                    if ("PLANNED".equals(d.getStatus())) { picked = d; break; }
                }
            }
            if (picked != null && picked.getTrip() != null && picked.getTrip().getRoute() != null) {
                Route r = picked.getTrip().getRoute();
                dto.setCurrentRouteCode(r.getCode());
                dto.setCurrentRouteName(r.getName());
            }
        } catch (Exception ignored) {
            // best-effort; nao parte se algo correr mal a resolver a linha.
        }

        return dto;
    }
}
