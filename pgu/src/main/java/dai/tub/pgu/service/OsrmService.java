package dai.tub.pgu.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class OsrmService
{
    private static final Logger log = LoggerFactory.getLogger(OsrmService.class);

    private final String osrmUrl;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public OsrmService(@Value("${osrm.url}") String osrmUrl)
    {
        this.osrmUrl = osrmUrl;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    }

    /**
     * Calcula a rota real entre dois pontos usando OSRM.
     * Retorna lista de [lat, lon] que seguem as estradas.
     * Em caso de falha, retorna null.
     */
    public List<List<Double>> getRoute(double lat1, double lon1, double lat2, double lon2)
    {
        String url = String.format(Locale.US, "%s/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=polyline&alternatives=true",
            osrmUrl, lon1, lat1, lon2, lat2);

        try
        {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("User-Agent", "TUB-PGU/1.0")
                .GET()
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200)
            {
                log.warn("OSRM returned status {}", response.statusCode());
                return null;
            }

            JsonNode root = objectMapper.readTree(response.body());
            if (!"Ok".equals(root.path("code").asText())) return null;

            JsonNode routes = root.path("routes");
            if (!routes.isArray() || routes.isEmpty()) return null;

            // Pick the shortest route by distance (not fastest by duration)
            // Buses typically follow the most direct road path, not highways
            JsonNode best = routes.get(0);
            double bestDist = best.path("distance").asDouble(Double.MAX_VALUE);
            for (int i = 1; i < routes.size(); i++)
            {
                double dist = routes.get(i).path("distance").asDouble(Double.MAX_VALUE);
                if (dist < bestDist)
                {
                    best = routes.get(i);
                    bestDist = dist;
                }
            }

            String geometry = best.path("geometry").asText();
            return decodePolyline(geometry);
        }
        catch (Exception e)
        {
            log.warn("OSRM failed ({},{}) -> ({},{}): {}", lat1, lon1, lat2, lon2, e.getMessage());
            return null;
        }
    }

    /**
     * Calcula a distância real pela estrada entre dois pontos (em metros).
     * Retorna -1 em caso de falha.
     */
    public double getDistance(double lat1, double lon1, double lat2, double lon2)
    {
        String url = String.format(Locale.US,
            "%s/route/v1/driving/%f,%f;%f,%f?overview=false",
            osrmUrl, lon1, lat1, lon2, lat2);

        try
        {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(5))
                .header("User-Agent", "TUB-PGU/1.0")
                .GET()
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) return -1;

            JsonNode root = objectMapper.readTree(response.body());
            if (!"Ok".equals(root.path("code").asText())) return -1;

            JsonNode routes = root.path("routes");
            if (!routes.isArray() || routes.isEmpty()) return -1;

            return routes.get(0).path("distance").asDouble(-1);
        }
        catch (Exception e)
        {
            log.warn("OSRM distance failed ({},{}) -> ({},{}): {}", lat1, lon1, lat2, lon2, e.getMessage());
            return -1;
        }
    }

    /**
     * Descodifica uma polyline encoded (Google/OSRM) em lista de [lat, lon].
     */
    private List<List<Double>> decodePolyline(String encoded)
    {
        List<List<Double>> points = new ArrayList<>();
        int idx = 0, lat = 0, lon = 0;

        while (idx < encoded.length())
        {
            // Decode latitude
            int shift = 0, result = 0;
            int b;
            do {
                b = encoded.charAt(idx++) - 63;
                result |= (b & 0x1F) << shift;
                shift += 5;
            } while (b >= 0x20);
            lat += ((result & 1) != 0) ? ~(result >> 1) : (result >> 1);

            // Decode longitude
            shift = 0; result = 0;
            do {
                b = encoded.charAt(idx++) - 63;
                result |= (b & 0x1F) << shift;
                shift += 5;
            } while (b >= 0x20);
            lon += ((result & 1) != 0) ? ~(result >> 1) : (result >> 1);

            points.add(List.of(lat / 1e5, lon / 1e5));
        }

        return points;
    }
}
