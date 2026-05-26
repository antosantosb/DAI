package dai.tub.pgu.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Sprint 0 (F3): proxy NGSI-LD sobre o FIWARE Orion.
 *
 * <p>O Orion 3.9 fala NGSI v2 nativamente; o caderno exige NGSI-LD v1.6
 * exposto pelo backend (R.INT.06). Este service:
 * <ol>
 *   <li>Chama a API v2 do Orion (rede interna {@code etl_net}).</li>
 *   <li>Traduz cada entity NGSI v2 para o formato NGSI-LD v1.6.</li>
 *   <li>Acrescenta o {@code @context} configurado (Smart Data Models).</li>
 * </ol>
 *
 * <p>Regras de tradução de atributos:
 * <ul>
 *   <li>{@code type: "geo:json"} -> {@code type: "GeoProperty"}</li>
 *   <li>{@code type: "Reference"} -> {@code type: "Relationship"}, {@code value -> object}</li>
 *   <li>Outros tipos -> {@code type: "Property"} (preserva valor)</li>
 * </ul>
 */
@Service
@Slf4j
public class NgsiLdService {

    private final RestClient restClient;
    private final ObjectMapper mapper;
    private final String contextUrl;

    public NgsiLdService(@Value("${pgu.orion.v2-url}") String orionV2Url,
                         @Value("${pgu.orion.ld-context}") String contextUrl,
                         ObjectMapper mapper) {
        this.restClient = RestClient.builder().baseUrl(orionV2Url).build();
        this.mapper = mapper;
        this.contextUrl = contextUrl;
    }

    /**
     * Lista entities (opcionalmente filtradas por type) em formato NGSI-LD.
     */
    @Cacheable(value = "ngsiLd", key = "'list:' + #type + ':' + #limit + ':' + #offset")
    public List<Map<String, Object>> listEntities(String type, int limit, int offset) {
        String uri = UriComponentsBuilder.fromPath("/entities")
                .queryParam("limit", Math.min(limit, 1000))
                .queryParam("offset", offset)
                .queryParamIfPresent("type", type == null || type.isBlank()
                        ? java.util.Optional.empty()
                        : java.util.Optional.of(type))
                .build()
                .toUriString();

        ResponseEntity<JsonNode> resp = restClient.get().uri(uri).retrieve().toEntity(JsonNode.class);
        JsonNode body = resp.getBody();
        if (body == null || !body.isArray()) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>(body.size());
        for (JsonNode v2 : body) {
            out.add(translateV2ToLd(v2));
        }
        return out;
    }

    /**
     * Obtem uma entity individual em formato NGSI-LD.
     * Lança {@code NotFound} se o Orion devolver 404.
     */
    public Map<String, Object> getEntity(String id) {
        ResponseEntity<JsonNode> resp = restClient.get()
                .uri("/entities/{id}", id)
                .retrieve()
                .toEntity(JsonNode.class);
        JsonNode body = resp.getBody();
        if (body == null) {
            throw new NotFound("Entity nao encontrada: " + id);
        }
        return translateV2ToLd(body);
    }

    /**
     * Lista os tipos distintos de entities no Orion.
     */
    @Cacheable(value = "ngsiLd", key = "'types'")
    public List<String> listTypes() {
        ResponseEntity<JsonNode> resp = restClient.get()
                .uri("/types?values=true")
                .retrieve()
                .toEntity(JsonNode.class);
        JsonNode body = resp.getBody();
        if (body == null || !body.isArray()) return List.of();
        List<String> types = new ArrayList<>(body.size());
        body.forEach(n -> {
            if (n.isTextual()) types.add(n.asText());
        });
        return types;
    }

    /**
     * Traduz uma entity NGSI v2 (JsonNode) para um Map representando NGSI-LD v1.6.
     * Preserva ordem dos campos: id, type, @context, depois atributos.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> translateV2ToLd(JsonNode v2) {
        ObjectNode ld = mapper.createObjectNode();
        if (v2.has("id")) ld.set("id", v2.get("id"));
        if (v2.has("type")) ld.set("type", v2.get("type"));

        // @context aponta para Smart Data Models (FIWARE)
        ArrayNode ctx = mapper.createArrayNode();
        ctx.add(contextUrl);
        ld.set("@context", ctx);

        Iterator<Map.Entry<String, JsonNode>> fields = v2.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String key = entry.getKey();
            if ("id".equals(key) || "type".equals(key)) continue;

            JsonNode attr = entry.getValue();
            if (!attr.isObject() || !attr.has("type")) {
                // attribute simplificado (raro): tratar como Property literal
                ObjectNode p = mapper.createObjectNode();
                p.put("type", "Property");
                p.set("value", attr);
                ld.set(key, p);
                continue;
            }

            String v2Type = attr.path("type").asText("");
            ObjectNode ldAttr = mapper.createObjectNode();
            if ("geo:json".equalsIgnoreCase(v2Type) || isGeometryType(v2Type)) {
                ldAttr.put("type", "GeoProperty");
                ldAttr.set("value", attr.path("value"));
            } else if ("Reference".equalsIgnoreCase(v2Type)) {
                ldAttr.put("type", "Relationship");
                ldAttr.set("object", attr.path("value"));
            } else {
                ldAttr.put("type", "Property");
                ldAttr.set("value", attr.path("value"));
            }
            // Preservar metadata (timestamp, unitCode, etc.) se existirem
            if (attr.has("metadata")) {
                JsonNode meta = attr.get("metadata");
                if (meta.has("timestamp")) {
                    ldAttr.set("observedAt", meta.path("timestamp").path("value"));
                }
                if (meta.has("unitCode")) {
                    ldAttr.set("unitCode", meta.path("unitCode").path("value"));
                }
            }
            ld.set(key, ldAttr);
        }

        return mapper.convertValue(ld, Map.class);
    }

    private static boolean isGeometryType(String t) {
        if (t == null) return false;
        return "Point".equalsIgnoreCase(t)
                || "Polygon".equalsIgnoreCase(t)
                || "LineString".equalsIgnoreCase(t)
                || "MultiPoint".equalsIgnoreCase(t)
                || "MultiPolygon".equalsIgnoreCase(t)
                || "MultiLineString".equalsIgnoreCase(t);
    }

    /**
     * Excecao 404 propria para o controller mapear para HTTP 404.
     */
    public static class NotFound extends RuntimeException {
        public NotFound(String msg) {
            super(msg);
        }
    }
}
