package dai.tub.pgu.config;

import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Configuration
public class FlywayConfig {

    @Bean
    public Flyway flyway(DataSource dataSource) {
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load();
        flyway.repair();
        flyway.migrate();
        return flyway;
    }

    @Bean
    public static BeanFactoryPostProcessor flywayJpaDependencyProcessor() {
        return factory -> {
            if (factory.containsBeanDefinition("entityManagerFactory")) {
                BeanDefinition emf = factory.getBeanDefinition("entityManagerFactory");
                String[] deps = emf.getDependsOn();
                List<String> depsList = deps != null
                        ? new ArrayList<>(Arrays.asList(deps))
                        : new ArrayList<>();
                depsList.add("flyway");
                emf.setDependsOn(depsList.toArray(new String[0]));
            }
        };
    }
}
