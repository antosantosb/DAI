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
