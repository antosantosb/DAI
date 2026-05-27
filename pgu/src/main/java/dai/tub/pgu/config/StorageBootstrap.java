package dai.tub.pgu.config;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Sprint 0 (F0): no arranque da aplicacao, garante que os buckets necessarios
 * existem no MinIO. Buckets:
 *
 * <ul>
 *   <li>{@code exports}: ficheiros gerados pelo Motor de Exportacao Massiva (F9)</li>
 *   <li>{@code attachments}: anexos de ocorrencias, fotos de avarias dos motoristas</li>
 * </ul>
 *
 * <p>Cada bucket e criado idempotentemente: se ja existir, nao acontece nada.
 * Falhas a contactar o MinIO sao logadas mas nao bloqueiam o boot (o backend
 * arranca na mesma; a funcionalidade que depender do storage ira reportar
 * erro pontual).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class StorageBootstrap {

    private final MinioClient minioClient;

    @Value("${pgu.storage.buckets.exports}")
    private String exportsBucket;

    @Value("${pgu.storage.buckets.attachments}")
    private String attachmentsBucket;

    @Value("${pgu.storage.buckets.avatars:avatars}")
    private String avatarsBucket;

    @EventListener(ApplicationReadyEvent.class)
    public void ensureBuckets() {
        List<String> buckets = List.of(exportsBucket, attachmentsBucket, avatarsBucket);
        for (String bucket : buckets) {
            try {
                boolean exists = minioClient.bucketExists(BucketExistsArgs.builder()
                        .bucket(bucket)
                        .build());
                if (!exists) {
                    minioClient.makeBucket(MakeBucketArgs.builder()
                            .bucket(bucket)
                            .build());
                    log.info("MinIO bucket criado: {}", bucket);
                } else {
                    log.info("MinIO bucket ja existe: {}", bucket);
                }
            } catch (Exception e) {
                log.error("Erro a verificar ou criar MinIO bucket {}: {}", bucket, e.getMessage());
            }
        }
    }
}
