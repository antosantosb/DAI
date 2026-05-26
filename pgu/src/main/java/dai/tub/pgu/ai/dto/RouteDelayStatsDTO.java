package dai.tub.pgu.ai.dto;

import java.util.List;

public record RouteDelayStatsDTO(Long routeId, String routeName, double avgDelayMin, double medianDelayMin, List<String> topProblematicStops) {}
