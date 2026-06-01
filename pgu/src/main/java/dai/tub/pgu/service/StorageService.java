package dai.tub.pgu.service;

import io.minio.GetObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.http.Method;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.concurrent.TimeUnit;

/**
 * Sprint 0 (F0): wrapper sobre o {@link MinioClient} com a API que o resto da
 * aplicacao precisa: upload, download, presigned URLs e remocao de objetos.
 *
 * <p>Buckets sao criados pelo {@link dai.tub.pgu.config.StorageBootstrap} no boot.
 * Os nomes dos buckets estao em {@code application.properties} (chaves
 * {@code pgu.storage.buckets.*}).
 *
 * <p>Quando a sessao do browser precisa de descarregar um objeto, gera-se uma
 * presigned URL via {@link #presignedUrl(String, String)}. O endpoint interno
 * ({@code http://minio:9000}) e substituido pelo publico (default
 * {@code http://localhost:9000}) para o browser conseguir aceder.
 */
@Service
@Slf4j
public class StorageService {

    /** Cliente interno (rede Docker) — usado para upload/download/stat/remove. */
    private final MinioClient minioClient;

    /** Cliente publico (visivel pelo browser) — usado para gerar presigned URLs. */
    private final MinioClient publicMinioClient;

    public StorageService(MinioClient minioClient,
                          @Qualifier("public") MinioClient publicMinioClient) {
        this.minioClient = minioClient;
        this.publicMinioClient = publicMinioClient;
    }

    @Value("${pgu.storage.presigned-ttl-seconds:86400}")
    private int defaultPresignedTtlSeconds;

    /** Endpoint publico (com path opcional ex. "/storage") usado para
     *  pos-processar presigned URLs — ver {@link #presignedUrl(String,String,int)}. */
    @Value("${pgu.storage.public-endpoint:${pgu.storage.endpoint}}")
    private String publicEndpoint;

    /**
     * Faz upload de um stream para um bucket.
     *
     * @param bucket      nome do bucket (ja deve existir; criado pelo StorageBootstrap)
     * @param key         caminho do objeto dentro do bucket (ex. "exports/2026/abc.csv")
     * @param data        InputStream com o conteudo
     * @param size        tamanho em bytes (use -1 se desconhecido)
     * @param contentType MIME type (ex. "text/csv"); null assume "application/octet-stream"
     */
    public void upload(String bucket, String key, InputStream data, long size, String contentType) {
        try {
            PutObjectArgs args = PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(data, size, -1)
                    .contentType(contentType != null ? contentType : "application/octet-stream")
                    .build();
            minioClient.putObject(args);
            log.info("Storage upload OK: bucket={} key={} size={}", bucket, key, size);
        } catch (Exception e) {
            throw new StorageException("Erro a fazer upload para MinIO: " + bucket + "/" + key, e);
        }
    }

    /**
     * Devolve um InputStream com o conteudo do objeto. Caller responsavel por fechar.
     */
    public InputStream download(String bucket, String key) {
        try {
            return minioClient.getObject(GetObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .build());
        } catch (Exception e) {
            throw new StorageException("Erro a descarregar de MinIO: " + bucket + "/" + key, e);
        }
    }

    /**
     * Gera presigned URL com o TTL default ({@code pgu.storage.presigned-ttl-seconds}).
     */
    public String presignedUrl(String bucket, String key) {
        return presignedUrl(bucket, key, defaultPresignedTtlSeconds);
    }

    /**
     * Gera presigned URL com TTL custom em segundos.
     */
    public String presignedUrl(String bucket, String key, int ttlSeconds) {
        try {
            // Usa o publicMinioClient — a signature e' calculada com o host
            // publico (ex. localhost:9000) que o browser vai usar. Sem isto,
            // o MinIO devolve SignatureDoesNotMatch porque recalcula o
            // canonical request com o host do request (localhost) e nao
            // bate com o que o backend interno (minio:9000) assinou.
            String url = publicMinioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(bucket)
                    .object(key)
                    .expiry(ttlSeconds, TimeUnit.SECONDS)
                    .build());

            // Re-insere o path prefix do publicEndpoint (ex. "/storage") se houver.
            // O SDK do MinIO Java nao aceita endpoints com path, por isso o
            // publicMinioClient foi construido so com scheme://host[:port]. Aqui
            // injectamos de volta o prefix para o browser bater com o proxy nginx.
            java.net.URI uri = java.net.URI.create(publicEndpoint);
            String pathPrefix = uri.getRawPath();
            if (pathPrefix != null && !pathPrefix.isEmpty() && !"/".equals(pathPrefix)) {
                pathPrefix = pathPrefix.replaceAll("/+$", "");
                url = url.replaceFirst("(https?://[^/]+)(.*)", "$1" + pathPrefix + "$2");
            }
            return url;
        } catch (Exception e) {
            throw new StorageException("Erro a gerar presigned URL: " + bucket + "/" + key, e);
        }
    }

    /**
     * Remove um objeto do bucket. Idempotente: nao lanca se ja nao existir.
     */
    public void delete(String bucket, String key) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .build());
            log.info("Storage delete OK: bucket={} key={}", bucket, key);
        } catch (Exception e) {
            throw new StorageException("Erro a apagar de MinIO: " + bucket + "/" + key, e);
        }
    }

    /**
     * Verifica se um objeto existe (via HEAD). Devolve false em qualquer erro.
     */
    public boolean exists(String bucket, String key) {
        try {
            minioClient.statObject(StatObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .build());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Excecao propria do StorageService para errors de I/O com o MinIO.
     */
    public static class StorageException extends RuntimeException {
        public StorageException(String msg, Throwable cause) {
            super(msg, cause);
        }
    }
}
