package dai.tub.pgu.audit;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect
@Component
public class AuditAspect {

    // Fica "à escuta" de qualquer método que tenha a etiqueta @LogActivity
    @Around("@annotation(logActivity)")
    public Object logAcao(ProceedingJoinPoint joinPoint, LogActivity logActivity) throws Throwable {
        
        // antes de o método correr
        System.out.println(" [AUDITORIA] Início da ação: " + logActivity.action() + " | Método: " + joinPoint.getSignature().getName());
        
        // Deixa o método da tua API correr normalmente
        Object resultado = joinPoint.proceed();
        
        // depois de o método correr com sucesso
        System.out.println(" [AUDITORIA] Sucesso na ação: " + logActivity.action());
        
        // (Mais tarde, é aqui que vamos guardar isto na Base de Dados)

        return resultado;
    }
}
