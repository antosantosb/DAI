package dai.tub.pgu.dto;

public class AnalyticsDTOs {

    /**
     * Sprint 1 (F2): adherence stoplight por rota.
     *   - GREEN  : delayedShare < 0.10  (avgDelayMin proxy < 2)
     *   - YELLOW : 0.10 <= delayedShare < 0.30  (proxy 2..5)
     *   - RED    : delayedShare >= 0.30  (proxy >= 5)
     */
    public record RouteAdherenceData(
            Long routeId,
            String routeCode,
            String routeName,
            String color,
            String operatorCode,
            double delayedShare,
            double avgDelayMin,
            long observations,
            long delayedCount
    ) {}

    /**
     * Sprint 1 (F6): cruzamento de dados de mobilidade real (R.IVT.10).
     * Evento operacional (ocorrencia ou alerta) que afetou autocarros de uma
     * rota dentro da janela analisada, para correlacionar com atrasos.
     *   - source    : "OCORRENCIA" | "ALERTA"
     *   - level     : prioridade da ocorrencia (CRITICA/NORMAL) ou nivel do alerta
     *   - title     : tipo de anomalia / motivo do alerta
     *   - busId     : bus_code do autocarro afetado (pode ser nulo)
     */
    public record RouteDelayCorrelation(
            String timestamp,
            String source,
            String level,
            String title,
            String description,
            String busId
    ) {
        public String getTimestamp() {
            return timestamp;
        }
        public String getSource() {
            return source;
        }
        public String getLevel() {
            return level;
        }
        public String getTitle() {
            return title;
        }
        public String getDescription() {
            return description;
        }
        public String getBusId() {
            return busId;
        }
    }


    public record FleetOccupancyData(
            String minute,
            long totalPassengers,
            long activeBuses,
            double occupancyRate
    ) {
        public String getMinute() {
            return minute != null ? minute : "Unknown Time";
        }
        public long getTotalPassengers() {
            return totalPassengers;
        }
        public long getActiveBuses() {
            return activeBuses;
        }
        public double getOccupancyRate() {
            return occupancyRate;
        }
    }

    /**
     * Pivot de estados por rota no dia corrente.
     * Permite barras empilhadas no frontend sem duplicar rótulos do eixo X.
     */
    public record RouteDelayData(
            String routeCode,
            long activeCount,
            long atStopCount,
            long stoppingCount,
            long delayedCount,
            long stoppedCount
    ) {
        public String getRouteCode() {
            return routeCode != null ? routeCode : "Unknown Route";
        }
        public long getActiveCount() {
            return activeCount;
        } 
        public long getAtStopCount() {
            return atStopCount;
        }
        public long getStoppingCount() {
            return stoppingCount;
        }
        public long getDelayedCount() {
            return delayedCount;
        }
        public long getStoppedCount() {
            return stoppedCount;
        }
    }

    public record HeatmapData(
            double lat,
            double lng,
            int passengerCount
    ) {
        public double getLat() {
            return lat;
        }
        public double getLng() {
            return lng;
        }
        public int getPassengerCount() {
            return passengerCount;
        }
    }

    public record BusEfficiencyData(
            String busId,
            double avgPassengers,
            int maxPassengers,
            long capacity,
            double avgOccupancyRate,
            double maxOccupancyRate
    ) {
        public String getBusId() {
            return busId;
        }
        public double getAvgPassengers() {
            return avgPassengers;
        }
        public int getMaxPassengers() {
            return maxPassengers;
        }
        public long getCapacity() {
            return capacity;
        }
        public double getAvgOccupancyRate() {
            return avgOccupancyRate;
        }
        public double getMaxOccupancyRate() {
            return maxOccupancyRate;
        }
    }

    public record SpeedOverTimeData(
            String minute,
            double avgSpeed
    ) {
        public String getMinute() {
            return minute != null ? minute : "Unknown Time";
        }
        public double getAvgSpeed() {
            return avgSpeed;
        }
    }

    /**
     * Sprint 1 (F5): indicadores de cobertura e frequencia (R.IVT.06).
     *
     * <p>Calculados a partir do horario planeado (modelo Transmodel: trip /
     * trip_stop_time) e da geometria das paragens, nao da telemetria. Por isso
     * NAO usam os filtros de data/hora dos restantes endpoints.</p>
     *
     *   - geographicCoveragePct : % da area de servico (aproximada pelo convex
     *     hull das paragens) a menos de ~400m a pe de qualquer paragem.
     *   - frequencyByRouteHour  : intervalo medio (headway) por linha e hora.
     *   - waitTimeByStop        : tempo medio de espera por paragem (headway/2).
     */
    public record CoverageIndicators(
            double geographicCoveragePct,
            java.util.List<RouteHourFrequency> frequencyByRouteHour,
            java.util.List<StopWaitTime> waitTimeByStop
    ) {
        public double getGeographicCoveragePct() {
            return geographicCoveragePct;
        }
        public java.util.List<RouteHourFrequency> getFrequencyByRouteHour() {
            return frequencyByRouteHour;
        }
        public java.util.List<StopWaitTime> getWaitTimeByStop() {
            return waitTimeByStop;
        }
    }

    /**
     * Frequencia de uma linha numa hora do dia (0-23).
     *   - avgHeadwayMinutes : intervalo medio entre partidas consecutivas dentro
     *     do balde horario; {@code null} quando ha menos de 2 partidas (sem
     *     intervalo definido).
     *   - tripCount         : numero de partidas nesse balde.
     */
    public record RouteHourFrequency(
            Long routeId,
            String routeCode,
            String routeName,
            int hour,
            Double avgHeadwayMinutes,
            int tripCount
    ) {
        public Long getRouteId() {
            return routeId;
        }
        public String getRouteCode() {
            return routeCode;
        }
        public String getRouteName() {
            return routeName;
        }
        public int getHour() {
            return hour;
        }
        public Double getAvgHeadwayMinutes() {
            return avgHeadwayMinutes;
        }
        public int getTripCount() {
            return tripCount;
        }
    }

    /**
     * Tempo medio de espera numa paragem ao longo do dia de servico.
     *   - avgWaitMinutes     : metade do headway medio (intervalo entre passagens
     *     consecutivas) na paragem.
     *   - departuresPerDay   : numero de passagens planeadas na paragem.
     */
    public record StopWaitTime(
            Long stopId,
            String stopCode,
            String stopName,
            double avgWaitMinutes,
            int departuresPerDay
    ) {
        public Long getStopId() {
            return stopId;
        }
        public String getStopCode() {
            return stopCode;
        }
        public String getStopName() {
            return stopName;
        }
        public double getAvgWaitMinutes() {
            return avgWaitMinutes;
        }
        public int getDeparturesPerDay() {
            return departuresPerDay;
        }
    }

    public record CongestionData(
            String busId,
            double lat,
            double lng,
            double speedKmh,
            int passengerCount,
            String recordedAt,
            String routeCode,
            String routeName,
            long capacity,
            double occupancyRate
    ) {
        public String getBusId() {
            return busId;
        }
        public double getLat() {
            return lat;
        }
        public double getLng() {
            return lng;
        }
        public double getSpeedKmh() {
            return speedKmh;
        }
        public int getPassengerCount() {
            return passengerCount;
        }
        public String getRecordedAt() {
            return recordedAt;
        }
        public String getRouteCode() {
            return routeCode;
        }
        public String getRouteName() {
            return routeName;
        }
        public long getCapacity() {
            return capacity;
        }
        public double getOccupancyRate() {
            return occupancyRate;
        }
    }
}
