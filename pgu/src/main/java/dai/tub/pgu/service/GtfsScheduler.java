package dai.tub.pgu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduler que verifica a cada 30 minutos se há uma sincronização
 * GTFS dos TUB agendada para executar.
 *
 * A decisão de executar ou não é feita pelo GtfsService.runScheduledSync()
 * com base na configuração (gtfs_config) e última execução.
 */
@Component
public class GtfsScheduler
{
    private static final Logger log = LoggerFactory.getLogger(GtfsScheduler.class);
    private final GtfsService gtfsService;

    public GtfsScheduler(GtfsService gtfsService)
    {
        this.gtfsService = gtfsService;
    }

    @Scheduled(fixedRate = 30 * 60 * 1000, initialDelay = 60 * 1000)
    public void checkScheduledSync()
    {
        try
        {
            gtfsService.runScheduledSync();
        }
        catch (Exception e)
        {
            log.error("[GTFS-SCHEDULER] Erro: {}", e.getMessage());
        }
    }
}
