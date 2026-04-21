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
}
