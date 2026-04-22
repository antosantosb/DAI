package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.BusDTO;
import dai.tub.pgu.service.BusService;

@RestController
@RequestMapping("/api/v1/buses")
public class BusController
{
    private final BusService busService;

    public BusController(BusService busService)
    {
        this.busService = busService;
    }

    @GetMapping
    public ResponseEntity<List<BusDTO>> getAll()
    {
        List<BusDTO> buses = busService.getAll();
        return buses.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(buses);
    }

    @GetMapping("/{id}")
    public ResponseEntity<BusDTO> getById(@PathVariable Long id)
    {
        return ResponseEntity.ok(busService.getById(id));
    }

    @PostMapping
    @LogActivity(action = "Criar autocarro")
    public ResponseEntity<BusDTO> create(@RequestBody BusDTO dto)
    {
        return ResponseEntity.status(201).body(busService.create(dto));
    }

    @PostMapping("/batch")
    @LogActivity(action = "Criar autocarros em batch")
    public ResponseEntity<List<BusDTO>> createBatch(@RequestParam(defaultValue = "5") int count)
    {
        if (count < 1 || count > 50) {
            throw new RuntimeException("Quantidade deve ser entre 1 e 50.");
        }
        return ResponseEntity.status(201).body(busService.createBatch(count));
    }

    @PatchMapping("/{id}")
    @LogActivity(action = "Atualizar autocarro")
    public ResponseEntity<BusDTO> update(@PathVariable Long id, @RequestBody BusDTO dto)
    {
        return ResponseEntity.ok(busService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @LogActivity(action = "Eliminar autocarro")
    public ResponseEntity<Void> delete(@PathVariable Long id)
    {
        busService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
