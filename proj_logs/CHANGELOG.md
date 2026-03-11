# Changelog
Todos os marcos e alterações notáveis a este projeto serão documentados neste ficheiro.

O formato baseia-se em Keep a Changelog (https://keepachangelog.com/pt-BR/1.0.0/).

## [0.1.0] - 2026-03-11

### Adicionado
- Infraestrutura Docker (Zero-Trust): Implementação da arquitetura base em docker-compose.yml contemplando:
  - Base de dados de infraestrutura isolada (postgres_tools) para Keycloak e Metabase.
  - Data Warehouse imaculada (postgres_postgis) para os dados de mobilidade.
  - Broker IoT (Mosquitto) e Context Broker (FIWARE Orion + MongoDB).
- Integração MQTT no Spring Boot: Criação da classe MqttConfig.java para escuta assíncrona do broker Mosquitto.
- Documentação de Propriedades: Adicionado ficheiro spring-configuration-metadata.json para reconhecimento nativo das variáveis customizadas no IDE.

### Alterado
- Downgrade do Java: Alterada a versão do Java no pom.xml de 25 para 21 (LTS) para garantir compatibilidade com o ambiente de desenvolvimento local.
- Refatorização da injeção de dependências adicionando a biblioteca base da Eclipse Paho (org.eclipse.paho.client.mqttv3).

### Corrigido
- Resolução de conflitos de bases de dados (Keycloak/Metabase) evitando a partilha forçada de esquemas na Data Warehouse.
- Correção de erros do compilador Maven associados ao maven-compiler-plugin no VS Code (limpeza de workspace e sincronização forçada).
- Formatação correta do payload JSON via CLI do Windows (mosquitto_pub) contornando o erro de aspas simples vs duplas.