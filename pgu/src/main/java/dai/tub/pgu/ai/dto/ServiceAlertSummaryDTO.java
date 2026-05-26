package dai.tub.pgu.ai.dto;
import java.time.Instant;
import java.util.List;


public record ServiceAlertSummaryDTO(String title, List<String> affectedRoutes,
                                  Instant validFrom, Instant validTo, String severity) {}
