package dai.tub.pgu.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Pool de threads dedicado a trabalhos de exportação massiva.
 * Usado pelo ExportService (@Async("exportExecutor")) para não
 * bloquear o pool HTTP do Tomcat.
 */
@Configuration
public class AsyncConfig
{
    @Bean(name = "exportExecutor")
    public TaskExecutor exportExecutor()
    {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(2);
        ex.setMaxPoolSize(4);
        ex.setQueueCapacity(25);
        ex.setThreadNamePrefix("export-");
        ex.setWaitForTasksToCompleteOnShutdown(true);
        ex.setAwaitTerminationSeconds(60);
        ex.initialize();
        return ex;
    }

    /**
     * Sprint 0 (F2): pool dedicado a inserts do api_access_log.
     *
     * <p>Pequeno (2 threads, queue 200): cada insert é rápido (~5ms). Em caso
     * de pico, queue dá margem; se a queue encher, os inserts sao descartados
     * silenciosamente (CallerRunsPolicy seria mau aqui — preferimos perder
     * audit do que bloquear o request).
     */
    @Bean(name = "auditExecutor")
    public TaskExecutor auditExecutor()
    {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(2);
        ex.setMaxPoolSize(2);
        ex.setQueueCapacity(200);
        ex.setThreadNamePrefix("audit-");
        ex.setWaitForTasksToCompleteOnShutdown(true);
        ex.setAwaitTerminationSeconds(10);
        ex.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.DiscardOldestPolicy());
        ex.initialize();
        return ex;
    }
}
