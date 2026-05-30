package dai.tub.pgu.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.dto.ActivityItem;
import dai.tub.pgu.service.ActivityService;

/**
 * Sprint 2 (estilo BRT): endpoint read-only do "activity feed" unificado.
 *
 * <p>Expoe os eventos recentes do sistema, agregados de varias fontes
 * (alertas, ocorrencias, audit), num unico feed ordenado por data decrescente.
 *
 * <p>Convencao de respostas (consistente com os restantes controllers): 200
 * com a lista quando ha resultados, ou 204 No Content quando esta vazia.
 */
@RestController
@RequestMapping("/api/v1/activity")
public class ActivityController {

    private final ActivityService activityService;

    public ActivityController(ActivityService activityService) {
        this.activityService = activityService;
    }

    /**
     * Lista os eventos recentes agregados.
     *
     * @param limit numero maximo de itens (default 50, maximo 200).
     */
    @GetMapping
    public ResponseEntity<List<ActivityItem>> getRecentActivity(
            @RequestParam(required = false) Integer limit) {
        List<ActivityItem> data = activityService.getRecentActivity(limit);
        return data.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(data);
    }
}
