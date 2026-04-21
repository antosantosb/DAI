package dai.tub.pgu.audit;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Aspect
@Component
public class AuditAspect {

    private static final Logger logger = LoggerFactory.getLogger(AuditAspect.class);

    @Around("@annotation(LogActivity)")
    public Object logAuditActivity(ProceedingJoinPoint joinPoint) throws Throwable {
        
        // Como estamos a testar localmente sem Azure, assumimos um utilizador de testes
        String username = "Administrador (Local)";
        
        // Descobrir qual foi o método e a classe chamados
        String methodName = joinPoint.getSignature().getName();
        String className = joinPoint.getTarget().getClass().getSimpleName();

        logger.info("AUDITORIA: O utilizador '{}' chamou o método '{}' na classe '{}'", username, methodName, className);

        Object result;
        try {
            // Deixa a operação do Spring Boot continuar normalmente
            result = joinPoint.proceed();
            logger.info("AUDITORIA: Sucesso na operação do método '{}'.", methodName);
        } catch (Throwable e) {
            logger.error("AUDITORIA: Erro na operação do método '{}'. Motivo: {}", methodName, e.getMessage());
            throw e; 
        }

        return result;
    }
} 
