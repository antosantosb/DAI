package dai.tub.pgu.dto;

import java.util.List;

/**
 * Sprint 1 (Fase 2): DTOs de entrada para a autoria manual de padroes (JourneyPattern)
 * a partir do mapa do backoffice.
 *
 * O utilizador coloca uma sequencia ordenada de pontos: cada ponto e' uma STOP
 * (paragem real, guardada no padrao) ou um WAYPOINT (ancora usada apenas para
 * moldar o tracado e depois descartada). O OSRM ajusta a geometria as estradas
 * passando por TODOS os pontos (stops + waypoints); o padrao guarda apenas as STOPS
 * ordenadas e a geometria ajustada.
 */
public class PatternAuthoringDTO
{
    /** Tipos de ponto na sequencia de autoria. */
    public enum PointType { STOP, WAYPOINT }

    /**
     * Pedido do preview de geometria (POST /api/v1/routes/preview-geometry).
     * {@code points} sao coordenadas ordenadas [lat, lon], stops E waypoints
     * misturados (apenas coordenadas).
     */
    public static class PreviewGeometryRequest
    {
        private List<List<Double>> points;

        public PreviewGeometryRequest() {}

        public List<List<Double>> getPoints()            { return this.points; }
        public void setPoints(List<List<Double>> points) { this.points = points; }
    }

    /**
     * Um ponto da sequencia de autoria do padrao: STOP (com stopId) ou WAYPOINT.
     * lat/lon sao sempre fornecidos (para o WAYPOINT sao a unica informacao; para
     * a STOP servem de fallback e para a geometria).
     */
    public static class PatternPoint
    {
        private PointType type;
        private Long stopId; // apenas para type == STOP
        private Double lat;
        private Double lon;

        public PatternPoint() {}

        public PointType getType()           { return this.type; }
        public Long      getStopId()         { return this.stopId; }
        public Double    getLat()            { return this.lat; }
        public Double    getLon()            { return this.lon; }

        public void setType(PointType type)  { this.type = type; }
        public void setStopId(Long stopId)   { this.stopId = stopId; }
        public void setLat(Double lat)       { this.lat = lat; }
        public void setLon(Double lon)       { this.lon = lon; }
    }

    /**
     * Pedido de criacao de padrao (POST /api/v1/routes/{routeId}/patterns).
     * {@code points} e' a sequencia ordenada de STOPs e WAYPOINTs.
     */
    public static class CreatePatternRequest
    {
        private Integer directionId = 0;
        private String name;
        private List<PatternPoint> points;

        public CreatePatternRequest() {}

        public Integer            getDirectionId()             { return this.directionId; }
        public String             getName()                    { return this.name; }
        public List<PatternPoint> getPoints()                  { return this.points; }

        public void setDirectionId(Integer directionId)        { this.directionId = directionId; }
        public void setName(String name)                       { this.name = name; }
        public void setPoints(List<PatternPoint> points)       { this.points = points; }
    }
}
