package dai.tub.pgu.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.Arrays;
import java.util.ArrayList;

import dai.tub.pgu.domain.Ocorrencia;
import dai.tub.pgu.domain.OcorrenciaAnexo;
import dai.tub.pgu.repository.OcorrenciaAnexoRepository;

@Service
public class AnexoService {

    private final OcorrenciaAnexoRepository anexoRepository;

    @Value("${pgu.anexos.pasta:/app/uploads/ocorrencias}")
    private String baseUploadDir;

    @Value("${pgu.anexos.max-size-bytes:20971520}")
    private long maxSizeBytes;

    @Value("${pgu.anexos.formatos-permitidos:jpg,jpeg,png,pdf}")
    private String formatosPermitidos;

    private List<String> getAllowedExtensions() {
        return Arrays.stream(formatosPermitidos.split(","))
            .map(s -> "." + s.trim().toLowerCase())
            .collect(Collectors.toList());
    }

    private List<String> getAllowedMimeTypes() {
        List<String> mimes = new ArrayList<>();
        String[] fmts = formatosPermitidos.split(",");
        for (String f : fmts) {
            String clean = f.trim().toLowerCase();
            if (clean.equals("jpg") || clean.equals("jpeg")) {
                mimes.add("image/jpeg");
            } else if (clean.equals("png")) {
                mimes.add("image/png");
            } else if (clean.equals("pdf")) {
                mimes.add("application/pdf");
            } else {
                mimes.add("image/" + clean);
                mimes.add("application/" + clean);
            }
        }
        return mimes;
    }

    public AnexoService(OcorrenciaAnexoRepository anexoRepository) {
        this.anexoRepository = anexoRepository;
    }

    public OcorrenciaAnexo salvarAnexo(Ocorrencia ocorrencia, MultipartFile file, String username) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O ficheiro está vazio.");
        }

        // Validar tamanho
        if (file.getSize() > maxSizeBytes) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O ficheiro excede o tamanho máximo permitido de 20 MB.");
        }

        // Validar formato (MIME Type e Extensão)
        String mimeType = file.getContentType();
        List<String> allowedMimes = getAllowedMimeTypes();
        if (mimeType == null || !allowedMimes.contains(mimeType.toLowerCase())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Formato de ficheiro não suportado. Formatos permitidos: JPG, PNG, PDF.");
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null) {
            originalFilename = "anexo_" + UUID.randomUUID().toString();
        }

        String ext = getFileExtension(originalFilename);
        List<String> allowedExts = getAllowedExtensions();
        if (!allowedExts.contains(ext.toLowerCase())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Formato de ficheiro não suportado. Formatos permitidos: JPG, PNG, PDF.");
        }

        try {
            // Caminho: baseUploadDir + "/" + ocorrencia.getId()
            Path dirPath = Paths.get(baseUploadDir, ocorrencia.getId().toString());

            Files.createDirectories(dirPath);

            // Gerar nome único para salvar no disco para evitar colisões
            String uniqueFilename = UUID.randomUUID().toString() + ext;
            Path filePath = dirPath.resolve(uniqueFilename);

            // Gravar no disco
            Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);

            // Registar no banco
            OcorrenciaAnexo anexo = new OcorrenciaAnexo();
            anexo.setOcorrencia(ocorrencia);
            anexo.setNomeFicheiro(originalFilename);
            anexo.setTamanhoBytes(file.getSize());
            anexo.setMimeType(mimeType);
            anexo.setCaminho(filePath.toString());
            anexo.setUploadPor(username);
            anexo.setUploadEm(Instant.now());

            return anexoRepository.save(anexo);
        } catch (ResponseStatusException rse) {
            throw rse;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Erro ao gravar anexo no servidor: " + e.getMessage(), e);
        }
    }

    public List<OcorrenciaAnexo> listarAnexos(Long ocorrenciaId) {
        return anexoRepository.findByOcorrenciaId(ocorrenciaId);
    }

    private String getFileExtension(String fileName) {
        int lastIndex = fileName.lastIndexOf('.');
        if (lastIndex == -1) return "";
        return fileName.substring(lastIndex);
    }
}
