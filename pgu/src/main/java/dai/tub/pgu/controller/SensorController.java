package dai.tub.pgu.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.domain.Bus;
import dai.tub.pgu.domain.VehicleSensor;
import dai.tub.pgu.dto.VehicleSensorDTO;
import dai.tub.pgu.repository.BusRepository;
import dai.tub.pgu.repository.VehicleSensorRepository;

import jakarta.persistence.EntityNotFoundException;

import java.util.Map;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * CRUD e atribuicao do inventario de main sensors (gateways de telematica a bordo).
 *
 * <p>Exposto em {@code /api/v1/sensors}. Acesso restrito a admin/funcionario/
 * developer (matchers em {@link dai.tub.pgu.config.SecurityConfig}).
 * <ul>
 *   <li>{@code GET    /api/v1/sensors}            : lista todos (ou livres com ?free=true).</li>
 *   <li>{@code GET    /api/v1/sensors/free}       : lista os sensores livres (sem autocarro).</li>
 *   <li>{@code GET    /api/v1/sensors/{id}}       : detalhe.</li>
 *   <li>{@code POST   /api/v1/sensors}            : criar.</li>
 *   <li>{@code PUT    /api/v1/sensors/{id}}          : editar (gateway, estado).</li>
 *   <li>{@code PUT    /api/v1/sensors/{id}/assign}   : atribuir a um autocarro.</li>
 *   <li>{@code PUT    /api/v1/sensors/{id}/unassign} : libertar (bus_id = null).</li>
 *   <li>{@code DELETE /api/v1/sensors/{id}}       : remover.</li>
 * </ul>
 *
 * <p>Regra de integridade (espelha o motorista): um sensor atribuido a um
 * autocarro EM SERVICO (nao STOPPED) nao pode ser editado, eliminado nem
 * desatribuido. As mutacoes sao rejeitadas com 409 ate o autocarro parar
 * (STOPPED); sensores livres ou de autocarros parados sao sempre editaveis.
 */
@RestController
@RequestMapping("/api/v1/sensors")
public class SensorController {

    private final VehicleSensorRepository repo;
    private final BusRepository busRepo;
    // SRID 4326 (WGS84), coerente com bus_stops/vehicle_telemetry.
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

    // ObjectMapper partilhado e thread-safe, so' para ler o subsensor_health
    // (texto JSON) ao derivar o estado do sensor.
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP_TYPE =
            new TypeReference<Map<String, Object>>() {};
    // Limiar de avaria: qualquer sub-sensor com saude < 0.4 marca o sensor como AVARIA.
    private static final double FAULT_THRESHOLD = 0.4;

    public SensorController(VehicleSensorRepository repo, BusRepository busRepo) {
        this.repo = repo;
        this.busRepo = busRepo;
    }

    @GetMapping
    public ResponseEntity<List<VehicleSensorDTO>> list(
            @RequestParam(name = "free", required = false, defaultValue = "false") boolean free) {
        List<VehicleSensor> sensors = free ? repo.findByBusIdIsNull() : repo.findAll();
        List<VehicleSensorDTO> data = sensors.stream().map(this::toDto).toList();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    /** Atalho dedicado para a lista de sensores livres (sem autocarro atribuido). */
    @GetMapping("/free")
    public ResponseEntity<List<VehicleSensorDTO>> listFree() {
        List<VehicleSensorDTO> data = repo.findByBusIdIsNull().stream().map(this::toDto).toList();
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }

    @GetMapping("/{id}")
    public ResponseEntity<VehicleSensorDTO> get(@PathVariable Long id) {
        VehicleSensor s = repo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Sensor " + id + " nao encontrado"));
        return ResponseEntity.ok(toDto(s));
    }

    @PostMapping
    @LogActivity(action = "Criar main sensor")
    public ResponseEntity<VehicleSensorDTO> create(@RequestBody VehicleSensorDTO dto) {
        // Regra do modelo: um autocarro tem no maximo 1 main sensor. Se o corpo
        // ja' traz busId, validamos a atribuicao (autocarro existe e ainda nao
        // tem sensor) antes de criar, devolvendo 409 em caso de conflito.
        if (dto.getBusId() != null) {
            if (!busRepo.existsById(dto.getBusId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Autocarro " + dto.getBusId() + " nao existe");
            }
            // Defesa em profundidade: o POST default forca DISPONIVEL, mas se o
            // corpo trouxer um status "AVARIA" forcado, nao deixar atribuir.
            // Espelha a regra do PUT /assign: aparelho avariado nao vai a bordo.
            if (dto.getStatus() != null
                    && "AVARIA".equalsIgnoreCase(dto.getStatus().trim())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Nao e' possivel atribuir o sensor " + dto.getGateway()
                        + " a um autocarro porque esta' marcado como avaria."
                        + " Repare-o ou marque-o como Disponivel primeiro.");
            }
            if (repo.existsByBusId(dto.getBusId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Autocarro " + dto.getBusId() + " ja' tem um main sensor atribuido");
            }
        }

        VehicleSensor s = new VehicleSensor();
        s.setGateway(dto.getGateway());
        s.setBusId(dto.getBusId());
        if (dto.getDoorPosition() != null) s.setDoorPosition(dto.getDoorPosition());
        // O estado deixou de ser input no criar: e' derivado no toDto a partir
        // da atribuicao + estado do autocarro + saude. Qualquer status enviado
        // no POST e' descartado. Comeca DISPONIVEL (sensor livre por defeito).
        s.setStatus("DISPONIVEL");
        s.setSubsensorHealth(dto.subsensorHealthAsJson());
        s.setLastReadingAt(dto.getLastReadingAt());
        s.setLastReading(dto.getLastReading());
        if (dto.getLatitude() != null && dto.getLongitude() != null) {
            s.setLocation(geometryFactory.createPoint(
                    new Coordinate(dto.getLongitude(), dto.getLatitude())));
        }
        VehicleSensor saved = repo.save(s);
        return ResponseEntity.status(HttpStatus.CREATED).body(toDto(saved));
    }

    /**
     * Atribui um main sensor livre a um autocarro existente. O {@code busId} pode
     * vir como query param ({@code ?busId=}) ou no corpo do pedido.
     *
     * <p>Validacoes: o sensor tem de existir e estar livre; o autocarro tem de
     * existir; e o autocarro nao pode ja' ter outro main sensor atribuido.
     */
    @PutMapping("/{id}/assign")
    @LogActivity(action = "Atribuir main sensor a autocarro")
    public ResponseEntity<VehicleSensorDTO> assign(
            @PathVariable Long id,
            @RequestParam(name = "busId", required = false) Long busIdParam,
            @RequestBody(required = false) AssignRequest body) {

        Long busId = busIdParam != null ? busIdParam : (body != null ? body.busId() : null);
        if (busId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "busId e' obrigatorio (query param ou corpo do pedido)");
        }

        VehicleSensor s = repo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Sensor " + id + " nao encontrado"));

        if (s.getBusId() != null) {
            // Idempotente se ja' estiver atribuido ao mesmo autocarro; conflito se a outro.
            if (s.getBusId().equals(busId)) {
                return ResponseEntity.ok(toDto(s));
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Sensor " + id + " ja' esta' atribuido ao autocarro " + s.getBusId());
        }

        // Guard: um sensor livre marcado como AVARIA (aparelho na oficina, defeituoso)
        // nao pode ser atribuido a um autocarro. Validamos o status PERSISTIDO
        // (case-insensitive) ANTES do conflito "bus ja tem sensor". Para libertar o
        // sensor, o utilizador tem de o marcar como Disponivel no editar.
        if ("AVARIA".equalsIgnoreCase(s.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Nao e' possivel atribuir o sensor " + s.getGateway()
                    + " a um autocarro porque esta' marcado como avaria."
                    + " Repare-o ou marque-o como Disponivel primeiro.");
        }

        if (!busRepo.existsById(busId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Autocarro " + busId + " nao existe");
        }
        if (repo.existsByBusId(busId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Autocarro " + busId + " ja' tem um main sensor atribuido");
        }

        s.setBusId(busId);
        VehicleSensor saved = repo.save(s);
        return ResponseEntity.ok(toDto(saved));
    }

    /**
     * Edita os campos editaveis de um main sensor (gateway, estado). Espelha a
     * regra do motorista: um sensor atribuido a um autocarro EM SERVICO (nao
     * STOPPED) esta' bloqueado, tal como nao se pode editar um motorista a meio
     * de uma viagem. Liberta quando o autocarro fica parado (STOPPED).
     */
    @PutMapping("/{id}")
    @LogActivity(action = "Editar main sensor")
    public ResponseEntity<VehicleSensorDTO> update(@PathVariable Long id, @RequestBody VehicleSensorDTO dto) {
        VehicleSensor s = repo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Sensor " + id + " nao encontrado"));
        ensureNotInUse(s, "editar");
        if (dto.getGateway() != null) s.setGateway(dto.getGateway());
        // Status: 100% derivado quando o sensor esta' atribuido (qualquer valor
        // enviado e' descartado). Quando o sensor esta' LIVRE (bus_id IS NULL),
        // aceita um override manual restrito a "AVARIA" ou "DISPONIVEL" para
        // permitir marcar/desmarcar uma avaria por inspecao humana. Outros
        // valores sao ignorados (comportamento atual).
        if (s.getBusId() == null && dto.getStatus() != null) {
            String requested = dto.getStatus().trim().toUpperCase();
            if ("AVARIA".equals(requested) || "DISPONIVEL".equals(requested)) {
                s.setStatus(requested);
            }
        }
        if (dto.getDoorPosition() != null) s.setDoorPosition(dto.getDoorPosition());
        VehicleSensor saved = repo.save(s);
        return ResponseEntity.ok(toDto(saved));
    }

    /** Liberta o main sensor (passa a estar sem autocarro atribuido). */
    @PutMapping("/{id}/unassign")
    @LogActivity(action = "Libertar main sensor do autocarro")
    public ResponseEntity<VehicleSensorDTO> unassign(@PathVariable Long id) {
        VehicleSensor s = repo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Sensor " + id + " nao encontrado"));
        ensureNotInUse(s, "desatribuir");
        s.setBusId(null);
        VehicleSensor saved = repo.save(s);
        return ResponseEntity.ok(toDto(saved));
    }

    @DeleteMapping("/{id}")
    @LogActivity(action = "Remover main sensor")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        VehicleSensor s = repo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Sensor " + id + " nao encontrado"));
        ensureNotInUse(s, "eliminar");
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Bloqueia mutacoes a um sensor EM USO, com a mesma semantica EXATA do
     * motorista: so' bloqueia quando o autocarro atribuido NAO esta' totalmente
     * parado (STOPPED). Enquanto o bus estiver em servico (ACTIVE, STOPPING,
     * etc.) o sensor nao pode ser editado, eliminado nem desatribuido. Assim que
     * o autocarro fica STOPPED, as operacoes sao permitidas.
     *
     * <p>Sensores livres (sem autocarro) passam sempre. O estado do autocarro e'
     * carregado a partir do {@code busId}, tal como em
     * {@link dai.tub.pgu.service.DriverService#unassignDriver}. Lanca 409 com
     * mensagem clara em pt-PT, nomeando o gateway e o autocarro. {@code action}
     * e' o verbo da operacao ("editar", "eliminar", "desatribuir").
     */
    private void ensureNotInUse(VehicleSensor s, String action) {
        if (s.getBusId() == null) return; // sensor livre: tudo permitido
        Bus bus = busRepo.findById(s.getBusId()).orElse(null);
        // Espelha o motorista: so' bloqueia se o autocarro NAO estiver STOPPED.
        // Bus inexistente (orfao) nao bloqueia (deixa libertar/limpar o sensor).
        if (bus == null || "STOPPED".equals(bus.getStatus())) return;
        String busLabel = bus.getBusCode() != null ? bus.getBusCode() : ("#" + s.getBusId());
        throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Nao e' possivel " + action + " o sensor " + s.getGateway()
                + ". O autocarro " + busLabel + " esta' em servico."
                + " Aguarde que pare (STOPPED) para libertar o sensor.");
    }

    // Constroi o DTO resolvendo codigo + estado do autocarro (denormalizados)
    // quando atribuido. O busStatus permite ao frontend aplicar a mesma regra do
    // motorista (so' bloqueia editar/eliminar/libertar com o bus nao-STOPPED).
    //
    // O estado do sensor (ATIVO/INATIVO/AVARIA/DESCONHECIDO) deixou de ser input
    // editavel: e' DERIVADO aqui a partir da atribuicao + estado do autocarro +
    // saude dos sub-sensores. O valor persistido na coluna status e' ignorado.
    private VehicleSensorDTO toDto(VehicleSensor s) {
        String busCode = null;
        String busStatus = null;
        if (s.getBusId() != null) {
            Bus bus = busRepo.findById(s.getBusId()).orElse(null);
            if (bus != null) {
                busCode = bus.getBusCode();
                busStatus = bus.getStatus();
            }
        }
        VehicleSensorDTO dto = VehicleSensorDTO.from(s, busCode, busStatus);
        dto.setStatus(deriveStatus(s, busStatus));
        return dto;
    }

    /**
     * Deriva o estado do sensor para apresentacao. Mapeia para 5 valores
     * (ATIVO/INATIVO/AVARIA/DISPONIVEL/DESCONHECIDO) por esta ordem:
     * <ol>
     *   <li>sensor LIVRE com override manual "AVARIA" persistido -> AVARIA
     *       (preserva o que o utilizador marcou via PUT);</li>
     *   <li>sensor LIVRE noutro caso qualquer -> DISPONIVEL;</li>
     *   <li>atribuido + algum sub-sensor com saude &lt; 0.4 -> AVARIA (auto,
     *       sobrepoe-se);</li>
     *   <li>atribuido + autocarro a circular (status != STOPPED) -> ATIVO;</li>
     *   <li>atribuido + autocarro parado (STOPPED) -> INATIVO.</li>
     * </ol>
     * O DESCONHECIDO continua a existir como fallback tecnico raro (caminho
     * impossivel: cobre apenas dados invalidos/imprevistos).
     */
    private String deriveStatus(VehicleSensor s, String busStatus) {
        if (s.getBusId() == null) {
            // Sensor LIVRE: respeita o override manual "AVARIA"; senao DISPONIVEL.
            if ("AVARIA".equalsIgnoreCase(s.getStatus())) {
                return "AVARIA";
            }
            return "DISPONIVEL";
        }
        if (hasFault(s.getSubsensorHealth())) {
            return "AVARIA";
        }
        if ("STOPPED".equals(busStatus)) {
            return "INATIVO";
        }
        if (busStatus != null) {
            return "ATIVO";
        }
        // Fallback tecnico raro (dados imprevistos).
        return "DESCONHECIDO";
    }

    /**
     * Faz parse do subsensor_health (texto JSON) e devolve true se algum
     * sub-sensor tiver saude abaixo do limiar de avaria. Cada entrada pode ser um
     * numero (a propria saude) ou um objecto com {@code health}/{@code value}.
     * JSON ausente/invalido -> sem avaria (best-effort, nao mascara avarias reais).
     */
    private boolean hasFault(String rawHealth) {
        if (rawHealth == null || rawHealth.isBlank()) return false;
        Map<String, Object> map;
        try {
            map = JSON.readValue(rawHealth, MAP_TYPE);
        } catch (Exception e) {
            return false;
        }
        if (map == null) return false;
        for (Object entry : map.values()) {
            Double health = readHealth(entry);
            if (health != null && health < FAULT_THRESHOLD) {
                return true;
            }
        }
        return false;
    }

    // Normaliza uma entrada do subsensor_health para a saude 0..1, ou null.
    // Aceita um numero directo, ou um objecto com health/value.
    @SuppressWarnings("unchecked")
    private Double readHealth(Object entry) {
        if (entry instanceof Number n) {
            return n.doubleValue();
        }
        if (entry instanceof Map<?, ?> obj) {
            Object h = ((Map<String, Object>) obj).get("health");
            if (h == null) h = ((Map<String, Object>) obj).get("value");
            if (h instanceof Number n) return n.doubleValue();
        }
        return null;
    }

    /** Corpo opcional do pedido de atribuicao: {@code { "busId": 123 }}. */
    public record AssignRequest(Long busId) {}
}
