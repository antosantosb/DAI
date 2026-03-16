package dai.tub.pgu.mapper;

import java.util.Collection;

import dai.tub.pgu.domain.VehicleTelemetry;
import dai.tub.pgu.dto.TelemetryDTO;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

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

            Collection<String> propertyNames = rootNode.propertyNames();
        
            for (String propertyName : propertyNames) 
            {
                JsonNode value = rootNode.get(propertyName);

                
                switch (propertyName) 
                {
                        case "busId":
                            dto.setBusId(value.asString());
                            break;
                        case "latitude":
                            dto.setLatitude(value.asDouble());
                            break;
                        case "longitude":
                            dto.setLongitude(value.asDouble());
                            break;
                        case "speed":
                            dto.setSpeed(value.asDouble());
                            break;
                        case "status":
                            dto.setStatus(value.asString());
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
            dto.setSpeed(entity.getSpeedKmh());
            dto.setTimestamp(entity.getRecordedAt());

            if (entity.getLocation() != null) 
            {
                dto.setLongitude(entity.getLocation().getX());
                dto.setLatitude(entity.getLocation().getY());
            }

            return dto;
    }
}
