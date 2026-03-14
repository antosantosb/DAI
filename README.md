# Plataforma de Gestão Urbana - Transportes Urbanos de Braga (TUB)

Este repositório contém o código-fonte e as simulações para a Prova de Conceito (PoC) da Plataforma de Gestão Urbana dos TUB, focada na centralização e interoperabilidade de dados de mobilidade.

## 🎯 Visão Geral do Projeto
O objetivo desta plataforma é agregar, monitorizar e gerir múltiplos sistemas operacionais dos TUB num único ponto de controlo. A arquitetura é baseada em microsserviços (Docker), utilizando tecnologias Open Source e normas abertas (FIWARE, NGSI-LD).

## 🏢 Verticais Implementados

### 1. Telemetria e Contagem de Passageiros (IoT)
Integração de dados simulados de sensores a bordo dos autocarros em tempo real.
* Protocolos: MQTT (Ingestão de dados de sensores) e NGSI-LD (via HTTP/REST).
* Componentes: Mosquitto (Broker IoT) e Orion Context Broker.
* Modelos de Dados: Alinhado com Smart Data Models (PassengerCount, Vehicle).

### 2. Integração com ERP (Legacy SQL Server)
Ligação direta à base de dados do ERP para suporte à decisão, sem replicação de dados para o Data Lake.
* Componente Analítica: Metabase.
* Dados: Gestão de Stocks, Manutenção de Frota, Recursos Humanos.

### 3. Bilhética
Preparação da arquitetura para ingestão de dados de validação de títulos de transporte, cruzando a procura real com a oferta planeada (GTFS).

## 🛠️ Arquitetura Tecnológica
A infraestrutura core foi desenhada com base na Arquitetura de Referência para Plataformas de Gestão Urbana (ARPGU) e inclui:
* Backend: Spring Boot (Java 21) com Spring Integration MQTT e Spring Data JPA.
* Ingestão IoT: Eclipse Mosquitto (Broker MQTT).
* Data Warehouse: PostgreSQL com extensão espacial PostGIS.
* Autenticação & SSO (Zero-Trust): Keycloak (Suporte a OpenID Connect e OAuth 2.0).
* Gestão de Contexto: FIWARE Orion Context Broker e MongoDB.
* Analítica & Dashboards: Metabase.
* Orquestração: Docker & Docker Compose.

## 🚀 Como Executar o Projeto

1. Clone o repositório:
   git clone https://github.com/antosantosb/DAI.git
   cd DAI/pgu

2. Levantar a Infraestrutura (Bases de Dados, Brokers e Ferramentas):
   docker-compose up -d
   (Aguarde alguns segundos para que os serviços, especialmente o PostgreSQL e o Keycloak, fiquem healthy).

3. Executar o Backend (Spring Boot):
   Abra o projeto no seu IDE (VS Code / IntelliJ) ou execute via terminal na raiz do projeto Java:
   mvn spring-boot:run
