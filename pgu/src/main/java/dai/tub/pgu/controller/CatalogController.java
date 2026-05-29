package dai.tub.pgu.controller;

import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import dai.tub.pgu.service.CatalogService;

/**
 * Sprint 1 (F3): API do Catalogo Nacional de dados abertos (R.IVT.09, R.INT.10).
 *
 * <p>Expoe um documento DCAT-AP em JSON-LD que portais como o dados.gov.pt
 * conseguem fazer harvest. Aberto (permitAll via SecurityConfig).
 */
@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogController
{
    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService)
    {
        this.catalogService = catalogService;
    }

    /**
     * Catalogo DCAT-AP. Content-Type {@code application/ld+json}.
     * A base URL e' derivada do request para as distribuicoes apontarem
     * sempre para o host correcto (dev ou Azure).
     */
    @GetMapping(value = "/datasets", produces = "application/ld+json")
    public ResponseEntity<Map<String, Object>> getCatalog()
    {
        String baseUrl = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        Map<String, Object> catalog = catalogService.buildCatalog(baseUrl);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/ld+json"))
                .body(catalog);
    }
}
