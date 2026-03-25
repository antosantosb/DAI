package dai.tub.pgu.mapper;

import java.time.Instant;
import java.util.Iterator;

import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.dto.TelemetryDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

// Esta classe vai ser alterado quando tivermos o motor de ingestão (Apache NiFi)

public class TelemetryMapper 
{
    private static final ObjectMapper mapper = new ObjectMapper();

    public static TelemetryDTO fromJson(String jsonPayload)
    {
        TelemetryDTO dto = new TelemetryDTO();

        try
        {
            JsonNode rootNode =  mapper.readTree(jsonPayload);

            Iterator<String> fieldNames = rootNode.fieldNames();

            while (fieldNames.hasNext())
            {
                String propertyName = fieldNames.next();
                JsonNode value = rootNode.get(propertyName);

                
                switch (propertyName)
                {
                        case "id_veiculo":
                        case "busId":
                            dto.setBusId(value.asText());
                            break;
                        case "lat":
                        case "latitude":
                            dto.setLatitude(value.asDouble());
                            break;
                        case "lon":
                        case "longitude":
                            dto.setLongitude(value.asDouble());
                            break;
                        case "passageiros":
                        case "passengers":
                            dto.setPassengers(value.asInt());
                            break;
                        case "velocidade_atual":
                        case "speed":
                            dto.setSpeed(value.asDouble());
                            break;
                        case "timestamp_leitura":
                        case "timestamp":
                            dto.setTimestamp(Instant.parse(value.asText()));
                            break;
                        case "estado":
                        case "status":
                            dto.setStatus(value.asText());
                            break;
                        default:
                            System.out.println("Aviso: Propriedade desconhecida ignorada -> " + propertyName);
                            break;
                    }
            }

            return dto;
        }
        catch (Exception e)
        {
            System.err.println("Erro crítico ao fazer o parsing em loop do JSON: " + e.getMessage());
            return null;
        }
    }

    public static TelemetryDTO fromEntity(VehicleTelemetry entity)
    {
        TelemetryDTO dto = new TelemetryDTO();
            
            dto.setBusId(entity.getBusId());
            dto.setPassengers(entity.getPassengers());
            dto.setSpeed(entity.getSpeedKmh());
            dto.setTimestamp(entity.getRecordedAt());
            dto.setStatus(entity.getStatus());

            if (entity.getLocation() != null) 
            {
                dto.setLongitude(entity.getLocation().getX());
                dto.setLatitude(entity.getLocation().getY());
            }

            return dto;
    }
}
