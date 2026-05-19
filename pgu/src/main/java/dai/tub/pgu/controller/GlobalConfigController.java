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
        return ResponseEntity.ok(configRepo.findById(1L).orElse(new GlobalConfig()));
    }

    @PutMapping
    @LogActivity(action = "Atualizar parâmetros globais")
    public ResponseEntity<GlobalConfig> updateConfigs(@RequestBody GlobalConfig req, 
                                                      @AuthenticationPrincipal Jwt jwt) {
        
        GlobalConfig config = configRepo.findById(1L).orElse(null);
        
        if (config == null) {
            return ResponseEntity.notFound().build();
        }

        config.setDelayLimitMinutes(req.getDelayLimitMinutes());
        config.setSocTolerancePercent(req.getSocTolerancePercent());
        config.setIotIntegrationLimit(req.getIotIntegrationLimit());
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