package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
    public ResponseEntity<BusDTO> create(@RequestBody BusDTO dto)
    {
        return ResponseEntity.status(201).body(busService.create(dto));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<BusDTO> update(@PathVariable Long id, @RequestBody BusDTO dto)
    {
        return ResponseEntity.ok(busService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id)
    {
        busService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
