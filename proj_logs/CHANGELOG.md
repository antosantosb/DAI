# Changelog
Todos os marcos e alterações notáveis a este projeto serão documentados neste ficheiro.

O formato baseia-se em Keep a Changelog (https://keepachangelog.com/pt-BR/1.0.0/).

## [0.2.0] - 2026-03-14

### Adicionado
- **Provisionamento Automático (One-Click Deployment):** Implementação de script `postgres-init/init-tools.sql` para criação automática das bases de dados `db_keycloak` e `db_metabase` no arranque do contentor.
- **Implementação do Fluxo ETL (NiFi):** Configuração do pipeline completo de processamento de dados:
  - **Ingestão:** Consumo assíncrono de mensagens via `ConsumeMQTT` (Broker Mosquitto).
  - **Transformação Dupla (Jolt):** Implementação de lógica de mapeamento para dois destinos:
    - Rota SQL: Conversão para formato plano compatível com a entidade JPA do Spring Boot.
    - Rota FIWARE: Conversão para standard NGSI-v2 com suporte a tipos `geo:json` (Point).
  - **Encaminhamento Dinâmico:** Uso de `InvokeHTTP` com cabeçalhos dinâmicos (`Content-Type: application/json`) e suporte a operações de `upsert` no Orion.
- **Persistência Robusta no NiFi:** Mapeamento explícito de volumes para os repositórios internos (`database_repository`, `flowfile_repository`, `content_repository` e `state_management`), garantindo a retenção de credenciais e fluxos.
- **Pipelines de Transformação Jolt:** - Mapeamento para **DTO Spring Boot** (formato plano para persistência SQL).
  - Mapeamento para **FIWARE NGSI-v2** (formato geo:json aninhado para o Context Broker).
- **Integração NGSI-v2:** Configuração de endpoints e headers dinâmicos (Content-Type) no NiFi para suporte ao Orion Context Broker.

### Alterado
- **Política de Segurança NiFi:** Atualização da password de administração para cumprir o requisito de 12 caracteres, evitando a geração de credenciais aleatórias.
- **Arquitetura de Dados:** Migração de uma base de dados única para múltiplas bases de dados lógicas isoladas no `postgres_tools`.

### Corrigido
- **Resiliência do NiFi:** Resolvido o problema de "amnésia" de configuração ao reiniciar o ambiente Docker.
- **Exposição de Portas:** Refatorização do `docker-compose.yml` para expor apenas as portas necessárias ao exterior (Data Warehouse e APIs), mantendo a infraestrutura de ferramentas em rede privada.

## [0.1.0] - 2026-03-11

### Adicionado
- Infraestrutura Docker (Zero-Trust): Implementação da arquitetura base em docker-compose.yml.
- Integração MQTT no Spring Boot: Criação da classe MqttConfig.java.
- Documentação de Propriedades: Adicionado ficheiro spring-configuration-metadata.json.

### Alterado
- Downgrade do Java: Versão alterada de 25 para 21 (LTS) por compatibilidade.
- Refatorização da injeção de dependências (Eclipse Paho).

### Corrigido
- Resolução de conflitos de bases de dados entre Keycloak/Metabase.
- Correção de erros do compilador Maven no VS Code.
- Formatação de payloads JSON via CLI mosquitto_pub.