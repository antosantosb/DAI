package dai.tub.pgu.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import dai.tub.pgu.domain.Operator;
import dai.tub.pgu.repository.OperatorRepository;

/**
 * Sprint 1 (F3): catalogo de dados abertos em DCAT-AP (R.IVT.09, R.INT.10).
 *
 * <p>Produz um documento JSON-LD compativel com DCAT-AP (Application Profile
 * for data portals in Europe), que o dados.gov.pt / Catalogo Nacional consegue
 * fazer harvest automaticamente. Estrutura: um {@code dcat:Catalog} com varios
 * {@code dcat:Dataset}, cada um com {@code dcat:Distribution} (os ficheiros
 * descarregaveis), {@code dcat:contactPoint} e {@code dct:publisher} (o
 * operador TUB, do F0).
 *
 * <p>Apenas datasets REAIS e descarregaveis sao listados: GeoJSON de linhas e
 * paragens (F1), o feed GTFS-Realtime (F7) e o export NeTEx (F8).
 *
 * <p>Validador: <https://www.itb.ec.europa.eu/shacl/dcat-ap/upload>
 */
@Service
public class CatalogService
{
    private final OperatorRepository operatorRepository;

    public CatalogService(OperatorRepository operatorRepository)
    {
        this.operatorRepository = operatorRepository;
    }

    /**
     * Constroi o catalogo DCAT-AP. {@code baseUrl} e' a origem publica
     * (ex: https://pgu.azurewebsites.net) derivada do request — assim as
     * URLs das distribuicoes estao sempre correctas em dev e em producao.
     */
    public Map<String, Object> buildCatalog(String baseUrl)
    {
        Operator op = operatorRepository.findByCode("TUB")
                .orElseGet(() -> operatorRepository.findAll().stream().findFirst().orElse(null));

        Map<String, Object> publisher = buildPublisher(op);
        Map<String, Object> contact = buildContactPoint(op);
        String today = LocalDate.now().toString();

        List<Map<String, Object>> datasets = new ArrayList<>();
        datasets.add(buildGeoJsonDataset(
                "routes",
                "Rotas de transporte urbano de Braga",
                "Geometria de todas as linhas em operação da rede TUB, em GeoJSON (RFC 7946, WGS 84). "
                        + "Cada feature é uma LineString com o percurso entre paragens.",
                baseUrl + "/api/v1/routes/export.geojson",
                baseUrl + "/open-data",
                today, publisher, contact));
        datasets.add(buildGeoJsonDataset(
                "stops",
                "Paragens de autocarro de Braga",
                "Localização de todas as paragens da rede TUB, em GeoJSON (RFC 7946, WGS 84). "
                        + "Cada feature é um Point com as linhas que servem a paragem.",
                baseUrl + "/api/v1/stops/export.geojson",
                baseUrl + "/open-data",
                today, publisher, contact));
        datasets.add(buildFeedDataset(
                "gtfs-rt",
                "GTFS-Realtime da rede TUB",
                "Posições dos veículos e atualizações de viagens em tempo real, em Protocol Buffers (GTFS-Realtime 2.0), compatível com Google Maps, Citymapper e outras apps de mobilidade.",
                List.of(
                        buildDistribution(baseUrl + "/api/v1/gtfs-rt/vehicle-positions.pb", "Protobuf", "application/x-protobuf"),
                        buildDistribution(baseUrl + "/api/v1/gtfs-rt/trip-updates.pb", "Protobuf", "application/x-protobuf")),
                baseUrl + "/open-data", today, publisher, contact,
                List.of("transporte", "autocarro", "Braga", "TUB", "GTFS-RT", "tempo real")));
        datasets.add(buildFeedDataset(
                "netex",
                "NeTEx da rede TUB",
                "Operadores, paragens, linhas, padrões e horários da rede TUB em NeTEx (CEN/TS 16614), o standard europeu de intercâmbio de dados de transporte público.",
                List.of(buildDistribution(baseUrl + "/api/v1/netex/export.xml", "NeTEx", "application/xml")),
                baseUrl + "/open-data", today, publisher, contact,
                List.of("transporte", "autocarro", "Braga", "TUB", "NeTEx")));

        Map<String, Object> catalog = new LinkedHashMap<>();
        catalog.put("@context", buildContext());
        catalog.put("@type", "dcat:Catalog");
        catalog.put("dct:title", "Dados abertos dos Transportes Urbanos de Braga");
        catalog.put("dct:description",
                "Catálogo de dados abertos da rede de transporte urbano de Braga (TUB), "
                        + "em formatos standard, sob licença CC BY 4.0.");
        catalog.put("dct:publisher", publisher);
        catalog.put("dct:language", "pt");
        catalog.put("dct:license", "https://creativecommons.org/licenses/by/4.0/");
        catalog.put("foaf:homepage", baseUrl + "/open-data");
        catalog.put("dct:modified", today);
        catalog.put("dcat:dataset", datasets);
        return catalog;
    }

    private Map<String, Object> buildGeoJsonDataset(String id, String title, String description,
                                                    String downloadUrl, String landingPage,
                                                    String modified, Map<String, Object> publisher,
                                                    Map<String, Object> contact)
    {
        Map<String, Object> distribution = new LinkedHashMap<>();
        distribution.put("@type", "dcat:Distribution");
        distribution.put("dcat:accessURL", downloadUrl);
        distribution.put("dcat:downloadURL", downloadUrl);
        distribution.put("dct:format", "GeoJSON");
        distribution.put("dcat:mediaType", "application/geo+json");
        distribution.put("dct:license", "https://creativecommons.org/licenses/by/4.0/");

        Map<String, Object> dataset = new LinkedHashMap<>();
        dataset.put("@type", "dcat:Dataset");
        dataset.put("dct:identifier", "pgu-" + id);
        dataset.put("dct:title", title);
        dataset.put("dct:description", description);
        dataset.put("dcat:landingPage", landingPage);
        dataset.put("dct:publisher", publisher);
        dataset.put("dcat:contactPoint", contact);
        dataset.put("dct:modified", modified);
        dataset.put("dct:license", "https://creativecommons.org/licenses/by/4.0/");
        // Tema DCAT-AP: Transporte (vocabulario de temas de dados da UE)
        dataset.put("dcat:theme", "http://publications.europa.eu/resource/authority/data-theme/TRAN");
        dataset.put("dcat:keyword", List.of("transporte", "autocarro", "Braga", "TUB", "GTFS"));
        dataset.put("dcat:distribution", List.of(distribution));
        return dataset;
    }

    /** Dataset generico: formato/mediaType arbitrarios e varias distribuicoes. */
    private Map<String, Object> buildFeedDataset(String id, String title, String description,
                                                 List<Map<String, Object>> distributions, String landingPage,
                                                 String modified, Map<String, Object> publisher,
                                                 Map<String, Object> contact, List<String> keywords)
    {
        Map<String, Object> dataset = new LinkedHashMap<>();
        dataset.put("@type", "dcat:Dataset");
        dataset.put("dct:identifier", "pgu-" + id);
        dataset.put("dct:title", title);
        dataset.put("dct:description", description);
        dataset.put("dcat:landingPage", landingPage);
        dataset.put("dct:publisher", publisher);
        dataset.put("dcat:contactPoint", contact);
        dataset.put("dct:modified", modified);
        dataset.put("dct:license", "https://creativecommons.org/licenses/by/4.0/");
        dataset.put("dcat:theme", "http://publications.europa.eu/resource/authority/data-theme/TRAN");
        dataset.put("dcat:keyword", keywords);
        dataset.put("dcat:distribution", distributions);
        return dataset;
    }

    private Map<String, Object> buildDistribution(String downloadUrl, String format, String mediaType)
    {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("@type", "dcat:Distribution");
        d.put("dcat:accessURL", downloadUrl);
        d.put("dcat:downloadURL", downloadUrl);
        d.put("dct:format", format);
        d.put("dcat:mediaType", mediaType);
        d.put("dct:license", "https://creativecommons.org/licenses/by/4.0/");
        return d;
    }

    private Map<String, Object> buildPublisher(Operator op)
    {
        Map<String, Object> publisher = new LinkedHashMap<>();
        publisher.put("@type", "foaf:Agent");
        publisher.put("foaf:name", op != null ? op.getName() : "Transportes Urbanos de Braga");
        return publisher;
    }

    private Map<String, Object> buildContactPoint(Operator op)
    {
        Map<String, Object> contact = new LinkedHashMap<>();
        contact.put("@type", "vcard:Organization");
        contact.put("vcard:fn", op != null ? op.getName() : "Transportes Urbanos de Braga");
        String email = (op != null && op.getContactEmail() != null) ? op.getContactEmail() : "geral@tub.pt";
        contact.put("vcard:hasEmail", "mailto:" + email);
        return contact;
    }

    private Map<String, Object> buildContext()
    {
        Map<String, Object> ctx = new LinkedHashMap<>();
        ctx.put("dcat", "http://www.w3.org/ns/dcat#");
        ctx.put("dct", "http://purl.org/dc/terms/");
        ctx.put("foaf", "http://xmlns.com/foaf/0.1/");
        ctx.put("vcard", "http://www.w3.org/2006/vcard/ns#");
        return ctx;
    }
}
