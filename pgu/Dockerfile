# ==========================================
# STAGE 1 — BUILD
# ==========================================
FROM maven:3.9.12-eclipse-temurin-21 AS builder
WORKDIR /app

COPY pom.xml ./
RUN mvn dependency:go-offline -B

COPY src ./src
RUN mvn package -Dmaven.test.skip=true -B

# ==========================================
# STAGE 2 — RUNTIME
# ==========================================
FROM eclipse-temurin:21-jre
WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]