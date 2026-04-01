package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.dto.BusStopDTO;
import dai.tub.pgu.dto.StopPanelDTO;
import dai.tub.pgu.service.BusStopService;
import dai.tub.pgu.service.StopPanelService;

@RestController
@RequestMapping("/api/v1/stops")
public class BusStopController
{
    private final BusStopService busStopService;
    private final StopPanelService stopPanelService;

    public BusStopController(BusStopService busStopService, StopPanelService stopPanelService)
    {
        this.busStopService = busStopService;
        this.stopPanelService = stopPanelService;
    }

    @GetMapping
    public ResponseEntity<List<BusStopDTO>> getAll()
    {
        List<BusStopDTO> stops = busStopService.getAll();
        return stops.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(stops);
    }

    @GetMapping("/{id}")
    public ResponseEntity<BusStopDTO> getById(@PathVariable Long id)
    {
        return ResponseEntity.ok(busStopService.getById(id));
    }

    @PostMapping
    public ResponseEntity<BusStopDTO> create(@RequestBody BusStopDTO dto)
    {
        return ResponseEntity.status(201).body(busStopService.create(dto));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<BusStopDTO> update(@PathVariable Long id, @RequestBody BusStopDTO dto)
    {
        return ResponseEntity.ok(busStopService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id)
    {
        busStopService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/panel")
    public ResponseEntity<StopPanelDTO> getPanel(@PathVariable Long id)
    {
        return ResponseEntity.ok(stopPanelService.getPanel(id));
    }
}
