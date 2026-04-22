package dai.tub.pgu.audit;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import dai.tub.pgu.model.AuditLog;
import dai.tub.pgu.repository.AuditLogRepository;

@Aspect
@Component
public class AuditAspect {

    private static final Logger logger = LoggerFactory.getLogger(AuditAspect.class);
    private final AuditLogRepository auditLogRepository;

    public AuditAspect(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @Around("@annotation(logActivity)")
    public Object logAuditActivity(ProceedingJoinPoint joinPoint, LogActivity logActivity) throws Throwable {

        String username = resolveUsername();
        String action = logActivity.action();
        String methodName = joinPoint.getSignature().getName();
        String className = joinPoint.getTarget().getClass().getSimpleName();

        logger.info("AUDITORIA: [{}] '{}' chamou {}.{}", action, username, className, methodName);

        Object result;
        try {
            result = joinPoint.proceed();
            logger.info("AUDITORIA: [{}] Sucesso em {}.{}", action, className, methodName);
            auditLogRepository.save(new AuditLog(username, action, className, methodName, true, null));
        } catch (Throwable e) {
            logger.error("AUDITORIA: [{}] Erro em {}.{} — {}", action, className, methodName, e.getMessage());
            auditLogRepository.save(new AuditLog(username, action, className, methodName, false, e.getMessage()));
            throw e;
        }

        return result;
    }

    /**
     * Extrai o username do JWT Keycloak via SecurityContext.
     * Fallback para "anónimo" se não houver autenticação (ex: chamadas internas/API key).
     */
    private String resolveUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return "sistema";
        }
        Object principal = auth.getPrincipal();
        if (principal instanceof Jwt jwt) {
            String name = jwt.getClaimAsString("preferred_username");
            return name != null ? name : jwt.getSubject();
        }
        return auth.getName();
    }
}
