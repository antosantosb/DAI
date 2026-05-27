package dai.tub.pgu.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import dai.tub.pgu.dto.UserRepresentationDTO;

/**
 * Service de avatares (fotos de perfil). Responsavel por:
 *   - validar e fazer upload de imagens para o bucket "avatars" do MinIO,
 *   - guardar a key resultante em Keycloak (atributo "avatarKey"),
 *   - apagar avatars antigos (best-effort, idempotente),
 *   - gerar presigned URLs (TTL configuravel) ao enriquecer DTOs de utilizador.
 */
@Service
public class AvatarService {

    private static final Logger log = LoggerFactory.getLogger(AvatarService.class);

    /** 2 MB — limite escolhido por boas praticas de tamanho de avatar. */
    public static final long MAX_AVATAR_BYTES = 2L * 1024 * 1024;

    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
        "image/png", "image/jpeg", "image/jpg", "image/webp"
    );

    /** TTL das presigned URLs devolvidas em GETs (1 hora). */
    private static final int PRESIGNED_TTL_SECONDS = 3600;

    private final StorageService storageService;
    private final KeycloakAdminService keycloakAdminService;

    @Value("${pgu.storage.buckets.avatars:avatars}")
    private String avatarsBucket;

    public AvatarService(StorageService storageService, KeycloakAdminService keycloakAdminService) {
        this.storageService = storageService;
        this.keycloakAdminService = keycloakAdminService;
    }

    /**
     * Faz upload de uma imagem como avatar do utilizador {@code userId}.
     * Valida tipo e tamanho. Substitui qualquer avatar anterior. Devolve a
     * presigned URL pronta a usar pelo cliente.
     */
    public String uploadAvatar(String userId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new AvatarValidationException("empty_file", "Ficheiro vazio");
        }
        if (file.getSize() > MAX_AVATAR_BYTES) {
            throw new AvatarValidationException("file_too_large", "Imagem demasiado grande (max 2MB)");
        }

        String contentType = file.getContentType() != null
            ? file.getContentType().toLowerCase(Locale.ROOT)
            : "";
        if (!ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new AvatarValidationException("unsupported_type",
                "Tipo de ficheiro nao suportado: " + contentType);
        }

        String extension = switch (contentType) {
            case "image/png" -> "png";
            case "image/webp" -> "webp";
            default -> "jpg";
        };

        String previousKey = keycloakAdminService.getAvatarKey(userId);

        // Key inclui userId + sufixo aleatorio para evitar colisao de cache no browser.
        String key = "users/" + userId + "-" + UUID.randomUUID().toString().substring(0, 8) + "." + extension;

        try (InputStream in = file.getInputStream()) {
            storageService.upload(avatarsBucket, key, in, file.getSize(), contentType);
        } catch (IOException e) {
            throw new RuntimeException("Erro ao ler ficheiro de upload", e);
        }

        keycloakAdminService.setAvatarKey(userId, key);

        // Best-effort: apagar o anterior. Nao deixar isso falhar o upload.
        if (previousKey != null && !previousKey.isBlank() && !previousKey.equals(key)) {
            try {
                storageService.delete(avatarsBucket, previousKey);
            } catch (Exception e) {
                log.warn("Falha ao apagar avatar anterior {} de {}: {}", previousKey, userId, e.getMessage());
            }
        }

        return storageService.presignedUrl(avatarsBucket, key, PRESIGNED_TTL_SECONDS);
    }

    /**
     * Remove o avatar do utilizador (limpa atributo Keycloak + apaga objeto MinIO).
     */
    public void deleteAvatar(String userId) {
        String key = keycloakAdminService.getAvatarKey(userId);
        keycloakAdminService.setAvatarKey(userId, null);
        if (key != null && !key.isBlank()) {
            try {
                storageService.delete(avatarsBucket, key);
            } catch (Exception e) {
                log.warn("Falha a apagar avatar {} de {}: {}", key, userId, e.getMessage());
            }
        }
    }

    /**
     * Enriquece um {@link UserRepresentationDTO} com a presigned URL do avatar
     * (se o avatarKey existir). Idempotente: se ja tiver URL ou nao tiver key,
     * deixa como esta.
     */
    public UserRepresentationDTO enrich(UserRepresentationDTO dto) {
        if (dto == null) return null;
        if (dto.getAvatarUrl() != null) return dto;
        String key = dto.getAvatarKey();
        if (key == null || key.isBlank()) return dto;
        try {
            dto.setAvatarUrl(storageService.presignedUrl(avatarsBucket, key, PRESIGNED_TTL_SECONDS));
        } catch (Exception e) {
            log.warn("Falha a gerar presigned URL para avatar {} ({}): {}", key, dto.getUsername(), e.getMessage());
        }
        return dto;
    }

    /**
     * Devolve a presigned URL diretamente a partir de uma avatarKey
     * (ou {@code null} se a key for vazia/nula).
     */
    public String urlForKey(String avatarKey) {
        if (avatarKey == null || avatarKey.isBlank()) return null;
        try {
            return storageService.presignedUrl(avatarsBucket, avatarKey, PRESIGNED_TTL_SECONDS);
        } catch (Exception e) {
            log.warn("Falha a gerar presigned URL para avatarKey {}: {}", avatarKey, e.getMessage());
            return null;
        }
    }

    /**
     * Devolve a presigned URL do avatar de um utilizador identificado pelo
     * keycloakUserId (id Keycloak ou username — depende de como o caller o
     * passa). Internamente carrega o avatarKey via Keycloak Admin API.
     */
    public String urlForUserId(String userId) {
        if (userId == null || userId.isBlank()) return null;
        try {
            String key = keycloakAdminService.getAvatarKey(userId);
            return urlForKey(key);
        } catch (Exception e) {
            log.warn("Falha a obter avatar do user {}: {}", userId, e.getMessage());
            return null;
        }
    }

    /** Excecao especifica para erros de validacao do payload de upload. */
    public static class AvatarValidationException extends RuntimeException {
        private final String code;

        public AvatarValidationException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String getCode() { return code; }
    }
}
