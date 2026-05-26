package dai.tub.pgu.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

/**
 * Sprint 0 (F2): cache em memoria via Caffeine.
 *
 * <p>Caches definidos:
 * <ul>
 *   <li>{@code routes}: rotas TUB (raramente mudam, queries hot no LiveMap)</li>
 *   <li>{@code stops}: paragens (idem)</li>
 *   <li>{@code gtfs}: hot queries do GTFS (calendarios, schedules)</li>
 * </ul>
 *
 * <p>TTL: 10 minutos. Tamanho maximo: 500 entries por cache.
 *
 * <p>Para invalidar: usar {@code @CacheEvict(value="routes", allEntries=true)}
 * em metodos que mutam (save, update, delete).
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager mgr = new CaffeineCacheManager("routes", "stops", "gtfs");
        mgr.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(10, TimeUnit.MINUTES)
                .maximumSize(500)
                .recordStats()  // expoe estatisticas via Micrometer
        );
        return mgr;
    }
}
