package dai.tub.pgu.ai.dto;

public record HeadwayStatsDTO(Long routeId, String routeName, double avgHeadwayMin,
                           int bunchingEvents, int gapEvents) {}
