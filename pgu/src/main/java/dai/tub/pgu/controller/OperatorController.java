package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.dto.OperatorDTO;
import dai.tub.pgu.service.OperatorService;

/**
 * Sprint 1 (F0): CRUD de operadores de transporte (R.IVT.03).
 *
 * <p>Endpoints abertos a todos os utilizadores autenticados para GET
 * (necessario para listagens de rotas). Mutacoes restritas a admin/developer
 * via {@code SecurityConfig}.
 */
@RestController
@RequestMapping("/api/v1/operators")
public class OperatorController
{
    private final OperatorService operatorService;

    public OperatorController(OperatorService operatorService)
    {
        this.operatorService = operatorService;
    }

    @GetMapping
    public ResponseEntity<List<OperatorDTO>> getAll()
    {
        return ResponseEntity.ok(operatorService.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<OperatorDTO> getById(@PathVariable Long id)
    {
        return ResponseEntity.ok(operatorService.getById(id));
    }

    @PostMapping
    @LogActivity(action = "Criar operador")
    public ResponseEntity<OperatorDTO> create(@RequestBody OperatorDTO dto)
    {
        return ResponseEntity.status(201).body(operatorService.create(dto));
    }

    @PatchMapping("/{id}")
    @LogActivity(action = "Atualizar operador")
    public ResponseEntity<OperatorDTO> update(@PathVariable Long id, @RequestBody OperatorDTO dto)
    {
        return ResponseEntity.ok(operatorService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @LogActivity(action = "Eliminar operador")
    public ResponseEntity<Void> delete(@PathVariable Long id)
    {
        operatorService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
