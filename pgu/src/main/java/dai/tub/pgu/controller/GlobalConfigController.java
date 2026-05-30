package dai.tub.pgu.controller;

import dai.tub.pgu.audit.LogActivity;
import dai.tub.pgu.domain.GlobalConfig;
import dai.tub.pgu.repository.GlobalConfigRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

@RestController
@RequestMapping("/api/v1/config") 
public class GlobalConfigController {

    private final GlobalConfigRepository configRepo;

    public GlobalConfigController(GlobalConfigRepository configRepo) {
        this.configRepo = configRepo;
    }

    @GetMapping
    public ResponseEntity<GlobalConfig> getConfigs() {
        // Sprint 0 (F4 follow-up): em vez de findById(1L), usar findAll().findFirst()
        // porque o id da unica linha pode nao ser 1 (depende do sequence).
        // Se nao existir, criar com defaults e devolver.
        GlobalConfig config = configRepo.findAll().stream().findFirst()
                .orElseGet(() -> {
                    GlobalConfig fresh = new GlobalConfig();
                    fresh.setUpdatedAt(Instant.now());
                    return configRepo.save(fresh);
                });
        return ResponseEntity.ok(config);
    }

    @PutMapping
    @LogActivity(action = "Atualizar parâmetros globais")
    public ResponseEntity<GlobalConfig> updateConfigs(@RequestBody GlobalConfig req,
                                                      @AuthenticationPrincipal Jwt jwt) {

        // Sprint 0 (F4 follow-up): robusto a id != 1.
        GlobalConfig config = configRepo.findAll().stream().findFirst()
                .orElseGet(GlobalConfig::new);

        config.setDelayLimitMinutes(req.getDelayLimitMinutes());
        config.setSocTolerancePercent(req.getSocTolerancePercent());
        config.setIotIntegrationLimit(req.getIotIntegrationLimit());
        // Sprint 0 (F4 follow-up): owner default das DataSources.
        config.setDefaultOwnerName(req.getDefaultOwnerName());
        config.setDefaultOwnerEmail(req.getDefaultOwnerEmail());

        // Sprint 2 (Vertical 3.4, R.ICP.05): thresholds de ocupacao com validacao
        // de range coerente. So aplica se vierem ambos os pcts; exige
        // 0 < warning < critical <= 100. no_data_minutes (se vier) tem de ser > 0.
        Integer warn = req.getOccupancyWarningPct();
        Integer crit = req.getOccupancyCriticalPct();
        if (warn != null && crit != null) {
            if (warn <= 0 || crit <= 0 || warn >= crit || crit > 100) {
                return ResponseEntity.badRequest().build();
            }
            config.setOccupancyWarningPct(warn);
            config.setOccupancyCriticalPct(crit);
        }
        Integer noData = req.getOccupancyNoDataMinutes();
        if (noData != null) {
            if (noData <= 0) {
                return ResponseEntity.badRequest().build();
            }
            config.setOccupancyNoDataMinutes(noData);
        }

        config.setUpdatedAt(Instant.now());

        if (jwt != null) {
            String username = jwt.getClaimAsString("preferred_username");
            if (username != null) {
                config.setUpdatedBy(username);
            }
        }

        return ResponseEntity.ok(configRepo.save(config));
    }
}