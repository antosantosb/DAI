package dai.tub.pgu.controller;

import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.BusDTO;
import dai.tub.pgu.service.BusService;

@RestController
@RequestMapping("/api/v1/buses")
@Validated
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

    @GetMapping("/code/{busCode}")
    public ResponseEntity<BusDTO> getByCode(@PathVariable String busCode)
    {
        return ResponseEntity.ok(busService.getByCode(busCode));
    }

    @PostMapping
    @LogActivity(action = "Criar autocarro")
    public ResponseEntity<BusDTO> create(@RequestBody BusDTO dto)
    {
        return ResponseEntity.status(201).body(busService.create(dto));
    }

    /**
     * Sprint -1 (BE-8): validacao declarativa com @Min/@Max.
     * Erros devolvem 400 (via GlobalExceptionHandler) em vez de 500.
     */
    /**
     * Sprint 1 follow-up: batch generation movido para a role `developer`
     * (antes admin). Faz parte do toolkit de demo, nao da gestao normal.
     */
    @PostMapping("/batch")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('developer')")
    @LogActivity(action = "Criar autocarros em batch")
    public ResponseEntity<List<BusDTO>> createBatch(
            @RequestParam(defaultValue = "5")
            @Min(value = 1, message = "Quantidade minima e 1")
            @Max(value = 50, message = "Quantidade maxima e 50")
            int count)
    {
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
