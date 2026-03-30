# Stage 1: Download map data with a modern image
FROM curlimages/curl:latest AS downloader
RUN curl -L -o /tmp/portugal-latest.osm.pbf \
      https://download.geofabrik.de/europe/portugal-latest.osm.pbf

# Stage 2: Process with OSRM tools
FROM osrm/osrm-backend:latest AS builder
COPY --from=downloader /tmp/portugal-latest.osm.pbf /data/portugal-latest.osm.pbf
RUN osrm-extract -p /opt/car.lua /data/portugal-latest.osm.pbf && \
    osrm-partition /data/portugal-latest.osrm && \
    osrm-customize /data/portugal-latest.osrm && \
    rm -f /data/portugal-latest.osm.pbf

# Stage 3: Final slim image with only processed data
FROM osrm/osrm-backend:latest
COPY --from=builder /data /data

EXPOSE 5000

CMD ["osrm-routed", "--algorithm", "mld", "/data/portugal-latest.osrm", "--port", "5000"]
