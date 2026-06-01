package dai.tub.pgu.config;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * Sprint 0 (F0): configuracao do cliente MinIO (S3-compatible storage).
 *
 * <p><b>Dois beans</b> para resolver o problema de presigned URLs cross-network:
 * <ul>
 *   <li><b>{@link #minioClient()}</b> (default, {@code @Primary}) — usa o endpoint
 *       interno (ex. {@code http://minio:9000}). Usado para uploads, downloads e
 *       gestao de buckets pelo backend dentro da rede Docker.</li>
 *   <li><b>{@link #publicMinioClient()}</b> (qualifier {@code "public"}) — usa o
 *       endpoint publico (ex. {@code http://localhost:9000}) visivel pelo browser
 *       do utilizador. Usado APENAS para gerar presigned URLs que serao abertas
 *       pelo browser.</li>
 * </ul>
 *
 * <p><b>Porque dois?</b> A presigned URL contem uma assinatura calculada com o
 * canonical request, que inclui o {@code Host} header. Se o backend gera a URL
 * com {@code minio:9000} (host header interno) mas o browser abre via
 * {@code localhost:9000}, o MinIO recalcula a assinatura com host
 * {@code localhost:9000} e devolve {@code SignatureDoesNotMatch}. Solucao: gerar
 * a URL ja com o host publico que o browser vai usar.
 */
@Configuration
public class MinioConfig {

    @Value("${pgu.storage.endpoint}")
    private String internalEndpoint;

    @Value("${pgu.storage.public-endpoint:${pgu.storage.endpoint}}")
    private String publicEndpoint;

    @Value("${pgu.storage.access-key}")
    private String accessKey;

    @Value("${pgu.storage.secret-key}")
    private String secretKey;

    @Value("${pgu.storage.region:us-east-1}")
    private String region;

    /** Cliente interno para uploads/downloads dentro da rede Docker. */
    @Bean
    @Primary
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(internalEndpoint)
                .credentials(accessKey, secretKey)
                .region(region)
                .build();
    }

    /** Cliente publico para gerar presigned URLs com host que o browser ve.
     *  O SDK Java do MinIO rejeita endpoints com path (ex. {@code /storage}),
     *  por isso extraimos so {@code scheme://host[:port]} e passamos ao client.
     *  O {@link dai.tub.pgu.service.StorageService} re-insere o prefix do path
     *  depois de gerar a URL. */
    @Bean
    @Qualifier("public")
    public MinioClient publicMinioClient() {
        java.net.URI uri = java.net.URI.create(publicEndpoint);
        String base = uri.getScheme() + "://" + uri.getHost()
                + (uri.getPort() != -1 ? ":" + uri.getPort() : "");
        return MinioClient.builder()
                .endpoint(base)
                .credentials(accessKey, secretKey)
                .region(region)
                .build();
    }
}
