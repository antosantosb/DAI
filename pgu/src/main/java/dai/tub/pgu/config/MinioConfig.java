package dai.tub.pgu.config;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Sprint 0 (F0): configuracao do cliente MinIO (S3-compatible storage).
 *
 * <p>O bean {@link MinioClient} e injetado pelo {@link dai.tub.pgu.service.StorageService}
 * e usado para upload, download, presigned URLs e gestao de buckets.
 *
 * <p>Em dev: aponta para o container {@code minio:9000} da rede {@code storage_net}.
 * Em prod: trocar {@code MINIO_ENDPOINT} no .env para o cluster MinIO real ou AWS S3.
 */
@Configuration
public class MinioConfig {

    @Value("${pgu.storage.endpoint}")
    private String endpoint;

    @Value("${pgu.storage.access-key}")
    private String accessKey;

    @Value("${pgu.storage.secret-key}")
    private String secretKey;

    @Value("${pgu.storage.region:us-east-1}")
    private String region;

    @Bean
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .region(region)
                .build();
    }
}
