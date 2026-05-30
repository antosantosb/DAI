package dai.tub.pgu.controller;

import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dai.tub.pgu.service.NeTExExportService;

/**
 * Sprint 1 (F8): export NeTEx da rede (R.IVT.02 / R.IVT.08 / R.IVT.11).
 *
 * <p>Devolve um documento NeTEx PublicationDelivery (standard europeu de
 * intercambio de dados de transporte publico) que autoridades de transporte
 * conseguem ingerir. Aberto (permitAll via SecurityConfig), tal como o
 * GeoJSON (F1) e o catalogo DCAT-AP (F3).
 */
@RestController
@RequestMapping("/api/v1/netex")
public class NeTExController
{
    private final NeTExExportService neTExExportService;

    public NeTExController(NeTExExportService neTExExportService)
    {
        this.neTExExportService = neTExExportService;
    }

    /**
     * Documento NeTEx completo da rede. Content-Type {@code application/xml}
     * (UTF-8), entregue como download (Content-Disposition: attachment).
     */
    @GetMapping(value = "/export.xml", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<byte[]> exportNetex()
    {
        byte[] xml = neTExExportService.exportNetwork();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"netex-tub.xml\"")
                .contentType(new MediaType(MediaType.APPLICATION_XML, StandardCharsets.UTF_8))
                .body(xml);
    }
}
