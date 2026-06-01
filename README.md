# PGU-TUB · Plataforma de Gestão Urbana dos Transportes de Braga

![Java](https://img.shields.io/badge/Java-21-orange.svg)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.0.5-brightgreen.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15_+_PostGIS-336791.svg)
![Keycloak](https://img.shields.io/badge/Keycloak-26-darkblue.svg)
![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)
![Ollama](https://img.shields.io/badge/AI-Qwen_2.5_on--premises-9F4AC1.svg)
![Transmodel](https://img.shields.io/badge/Modelo-Transmodel_CEN_TS_16614-blue.svg)
![GTFS-RT](https://img.shields.io/badge/Feed-GTFS--RT_+_NeTEx-yellow.svg)
![License](https://img.shields.io/badge/Licença-MIT-lightgrey.svg)

Plataforma única, **on-premises**, para a operação dos **Transportes Urbanos de Braga**: tempo real, bilhética, planeamento e IA generativa local — tudo num cockpit integrado.

> **Projecto académico DAI · 2.º ano de Engenharia Informática · Universidade do Minho · 2025-2026.**
> Não é uma plataforma oficial dos TUB.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Funcionalidades principais](#2-funcionalidades-principais)
3. [Arquitectura](#3-arquitectura)
4. [Pré-requisitos](#4-pré-requisitos)
5. [Arranque rápido](#5-arranque-rápido)
6. [Acessos e credenciais](#6-acessos-e-credenciais)
7. [Estrutura do repositório](#7-estrutura-do-repositório)
8. [Migrations Flyway](#8-migrations-flyway)
9. [Endpoints principais](#9-endpoints-principais)
10. [Variáveis de ambiente](#10-variáveis-de-ambiente)
11. [Desenvolvimento](#11-desenvolvimento)
12. [Standards e interoperabilidade](#12-standards-e-interoperabilidade)
13. [Documentação detalhada](#13-documentação-detalhada)

---

## 1. Visão geral

O PGU-TUB cobre as 3 grandes preocupações de um operador de transportes públicos urbanos:

- **Operação em tempo real** — Livemap com GPS dos autocarros, painéis DMS nas paragens, despacho/chat com motorista, módulo fiscal.
- **Planeamento e dados** — Linhas, padrões, viagens (Transmodel), escalas, calendário, GTFS / GTFS-RT / NeTEx import/export, dashboard de bilhética.
- **Inteligência** — Assistente IA on-premises (Ollama + Qwen 2.5) com *tool calling* para consultar a BD em linguagem natural, sem fuga de dados para a cloud.

Tudo isto corre num único `docker compose up` e usa apenas **stack aberta** (Spring Boot, PostgreSQL/PostGIS, NiFi, Mosquitto, Keycloak, Ollama, OSRM, MinIO).

---

## 2. Funcionalidades principais

### 2.1 Operação em tempo real

- **Livemap**: posições GPS actualizadas a cada ~5 s, clusters automáticos, smooth-zoom ao seleccionar autocarro, trajeto do pattern em curso destacado, paragens com painel DMS realçadas, heatmap e camadas toggleable.
- **Painéis DMS dinâmicos**: cada paragem com painel recebe ETA via MQTT. 3 colunas (Planeado · ETA · Atraso). Heartbeat com detecção automática de ONLINE/OFFLINE.
- **PainelBordo** (motorista): próxima paragem, próximas chegadas anunciadas ao utente, chat com despacho, estado do veículo, dark mode adaptativo.
- **Módulo Fiscal**: app mobile-first com mapa centrado no fiscal, paragem mais próxima, KPIs (validações/h, fraude, falsos positivos), sub-tabs `All / Fraud / False positive`, notificações push.
- **Despacho**: chat bidireccional motorista ↔ central, com confirmação de leitura por mensagem e alertas urgentes.

### 2.2 Planeamento (Transmodel-native)

- **Modelo Transmodel CEN/TS 16614**: `Route` → `JourneyPattern` → `Trip` → `TripStopTime`. Migrations `V40-V42`.
- **Editor visual de padrões** (`/backoffice/routes/:id/patterns/new`): cliques no mapa criam waypoints, OSRM encaixa pela estrada, Ctrl+Z, drag-and-drop.
- **Editor de horários** (`/backoffice/schedules`): mapa CARTO + lista de paragens, validação live de monotonia, criar/editar/apagar trips, todas as paragens obrigatórias.
- **Atribuição de escalas** (`Plan bus schedule`): liga sequência de Trips a um Bus num dia, valida que o bus está STOPPED, sincroniza `bus.route_id` com a duty `RUNNING`.
- **Calendário operacional** e dashboard de cobertura/frequência.
- **Operadores** (`/backoffice/operators`) com CRUD.

### 2.3 Bilhética e fiscalização

- **Validações** por canal (CARTAO, PASSE, BORDO, APP) com cálculo de coroa por StopZone, detecção de transbordo, criação automática de Ticket com validade configurável.
- Dashboard **Ticketing** (`/backoffice/ticketing`): KPIs, demand-per-hour, top lines, by channel, by category, by zone, live validations.
- **RGPD by design**: `cardPseudoId = SHA-256(cardId || salt)`. Sem cardId em claro persistido.

### 2.4 IA generativa local

- **Chatbot** (`/chatbot`) com Spring AI + Ollama + Qwen 2.5 3B.
- **Tool calling**: o modelo invoca funções Java tipadas (`AiTools.*`) para consultar atrasos, ocupação, alertas, ocorrências, energia, etc.
- **Memória conversacional por sessão** (últimas 10 mensagens) via `MessageChatMemoryAdvisor`.
- **Audit log** (`ai_interaction_log`) de cada interacção: utilizador, prompt SHA-256, latência, tools chamadas, estado.
- **Rate limit** + filtro de prompts suspeitos.
- **Warm-up no arranque** para evitar cold-start no primeiro pedido.

### 2.5 Segurança

- **Keycloak 26** com realm dedicado `pgu-realm`, 4 papéis (`admin`, `funcionario`, `motorista`, `fiscal`, `developer`).
- **MFA TOTP** obrigatório (FreeOTP, Google Authenticator, MS Authenticator).
- **OIDC** com refresh automático de tokens no frontend.
- **Auditoria** em `audit_log` e `api_access_log` para cada acção/request.
- **Filtros**: `InternalApiKeyFilter` para M2M, `AiRateLimitFilter`, `ApiAccessLogFilter`.

---

## 3. Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                          Frontend                                │
│      React 19 · Vite · Leaflet · Keycloak.js · STOMP            │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ HTTPS · WSS
┌────────────────────────────────┴─────────────────────────────────┐
│                       Spring Boot 4.0.5                          │
│  REST · WebSocket · Spring AI · Spring Security OIDC             │
│  AiTools · Schedule · BusDuty · Fiscal · Validation · MQTT       │
└──┬──────┬──────────┬──────────┬──────────┬──────────┬───────────┘
   │      │          │          │          │          │
┌──▼─┐  ┌─▼──┐    ┌──▼──┐    ┌──▼──┐    ┌──▼──┐    ┌─▼──────┐
│ PG │  │NiFi│    │MQTT │    │OSRM │    │Ollama│   │Keycloak│
│ +  │  │    │    │     │    │     │    │ +    │   │  26    │
│PostGIS │MQTT│   │Mosq.│    │self │    │Qwen2.│   │OIDC    │
└────┘  └────┘    └─────┘    └─────┘    └──────┘   └────────┘
```

Camadas (do mais perto do utilizador para o mais perto dos dados):

| Camada | Tecnologia |
|---|---|
| Apresentação | React 19 + Vite · Leaflet · Keycloak.js |
| Aplicação | Spring Boot 4 · Spring AI · Spring Security OIDC |
| Integração | Apache NiFi 2 · Mosquitto MQTT · STOMP WebSocket |
| Persistência | PostgreSQL 15 + PostGIS · Flyway · MinIO (objectos) |
| Inteligência | Ollama · Qwen 2.5 3B · OSRM (routing) |
| Identidade | Keycloak 26 OAuth2/OIDC · realm dedicado |

---

## 4. Pré-requisitos

- **Docker Desktop** com Compose v2 (Linux/macOS/Windows WSL2).
- **RAM**: 8 GB livre mínimo (Ollama Qwen 2.5 3B precisa ~3 GB sozinho).
  - No Windows WSL2, criar `C:\Users\<user>\.wslconfig` com:
    ```ini
    [wsl2]
    memory=8GB
    processors=4
    swap=4GB
    ```
    Depois `wsl --shutdown` e reabrir Docker Desktop.
- **Node.js 20+** (apenas se for desenvolver o frontend localmente; senão tudo corre em container).
- **Espaço em disco**: ~10 GB (imagens Docker + dados).

---

## 5. Arranque rápido

```bash
git clone https://github.com/antosantosb/DAI.git
cd DAI

# 1. Build de todas as imagens
docker compose build

# 2. Subir a stack (modo detached)
docker compose up -d

# 3. Acompanhar o arranque
docker compose logs -f spring-boot-backend
```

O backend está pronto quando aparecer `Started PguApplication in XX seconds` seguido de `[ai-warmup] modelo carregado em XXXX ms` (1-2 min na primeira vez — o Ollama está a baixar o modelo de ~2 GB).

Frontend: aceder a **http://localhost:5173** (Vite dev) ou **http://localhost** se a build de produção estiver pronta.

### Stop/clean

```bash
docker compose down              # pára os containers
docker compose down -v           # pára e apaga volumes (perde dados!)
docker compose ps                # ver estado dos containers
```

---

## 6. Acessos e credenciais

### Endpoints

| Serviço | URL local |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8081/api/v1 |
| Swagger | http://localhost:8081/swagger-ui.html |
| Keycloak | http://localhost:8080 |
| MinIO Console | http://localhost:9001 |
| Mailpit (dev) | http://localhost:8025 |

### Utilizadores de demonstração

| Role | Username | Password | Notas |
|---|---|---|---|
| Admin | `admin` | `admin123` | Acesso total + ferramentas dev |
| Funcionário | `func` | `func123` | Operação diária |
| Fiscal | `fiscal1` | `fiscal123` | App de fiscalização |
| Motorista | `motorista1` | sobrenome | App de bordo |
| Developer | `dev` | `dev123` | Hub `/backoffice/dev` + DevTools |

> Passwords aplicam-se ao ambiente local. Em produção, MFA TOTP é exigido no 1.º login.

---

## 7. Estrutura do repositório

```
DAI/
├── docker-compose.yml          # Orquestração de todos os serviços
├── .env.example                # Variáveis de ambiente (copiar para .env)
├── pgu/                        # Backend Spring Boot 4
│   ├── src/main/java/dai/tub/pgu/
│   │   ├── controller/         # REST controllers
│   │   ├── service/            # Lógica de negócio
│   │   ├── domain/             # Entidades JPA
│   │   ├── repository/         # Spring Data
│   │   ├── ai/                 # AiTools, AiChatService, AiRateLimitFilter
│   │   ├── audit/              # AuditAspect, LogActivity
│   │   └── config/             # Security, GlobalExceptionHandler
│   └── src/main/resources/
│       ├── application.properties
│       └── db/migration/       # Flyway V1__... V74__...
├── pgu-web/                    # Frontend React 19 + Vite
│   ├── src/pages/              # 1 ficheiro por rota principal
│   ├── src/components/         # Reutilizáveis (Layout, Modal, BusCard...)
│   ├── src/services/           # api.js, despachoApi, stompClient
│   ├── src/context/            # AuthProvider, ThemeProvider
│   └── src/i18n/locales/       # pt.json, en.json
├── nifi/                       # Pipelines de ingestão
├── mosquitto/                  # Config + ACL do broker MQTT
├── keycloak/                   # Realm export (`pgu-realm.json`)
├── simulator/                  # Simulador de telemetria de buses (Python)
├── docs/                       # Documentação + apresentação
│   ├── RELATORIO_BUILD.md
│   └── PGU-TUB-Apresentacao.pptx
└── PLANO_ITERACAO.md           # Histórico detalhado de sprints
```

---

## 8. Migrations Flyway

74 migrations cumulativas. Highlights:

| Migration | Conteúdo |
|---|---|
| V1-V10 | Telemetria, paragens, rotas, autocarros (base) |
| V11-V16 | Histórico de alertas, audit log, ocorrências, mensagens despacho |
| V17-V28 | Global config, GTFS tables, drivers, performance indices |
| V29-V37 | API access log, data sources, AI interaction log |
| V38-V39 | Operator, service calendar |
| **V40-V42** | **Modelo Transmodel** (JourneyPattern, Trip, TripStopTime) |
| V43-V47 | Pattern authoring (waypoints), observability, APC sensors |
| V48-V52 | Occupancy thresholds, ticketing foundation, vehicle sensors |
| V53 | `bus_duty` + estados (PLANNED, RUNNING, DONE, INTERRUPTED) |
| V54-V71 | Stop zones, fare config, integrações, fiscal, ocorrências |
| **V72** | **Invariante `trip.route_id == pattern.route_id`** + trigger |
| **V73** | **Sincronização `bus.route_id` ↔ duty RUNNING** |
| **V74** | **UNIQUE parcial em `bus_duty(trip_id, service_date)`** apenas para PLANNED/RUNNING |

Aplicam-se automaticamente no arranque do backend via Flyway.

---

## 9. Endpoints principais

Catálogo abreviado (versão completa em Swagger):

### Frota e operação

```
GET    /api/v1/buses                          # lista de autocarros
GET    /api/v1/buses/{id}                     # detalhe
POST   /api/v1/buses/{id}/start               # iniciar serviço
POST   /api/v1/buses/{id}/end                 # terminar serviço
POST   /api/v1/buses/{busId}/duties           # criar escala
GET    /api/v1/buses/{busId}/duties?date=...  # escalas do dia
```

### Linhas e padrões

```
GET    /api/v1/routes                                 # lista de linhas
GET    /api/v1/routes/{id}/patterns                   # padrões da linha
GET    /api/v1/patterns/{id}/geometry                 # polyline (lat,lon)
GET    /api/v1/patterns/{id}/stops                    # paragens ordenadas
GET    /api/v1/patterns/{id}/trips                    # trips do padrão
```

### Horários (Trip CRUD)

```
POST   /api/v1/schedules/trips                        # criar trip
PUT    /api/v1/schedules/trips/{id}                   # editar trip
DELETE /api/v1/schedules/trips/{id}                   # apagar trip
GET    /api/v1/schedules/trips/{id}/stops             # stop_times
GET    /api/v1/schedules/coverage                     # cobertura por rota
```

### Bilhética

```
POST   /api/v1/ticketing/validate                     # nova validação
GET    /api/v1/ticketing/dashboard?window=24h         # KPIs
```

### IA

```
POST   /api/v1/ai/chat                                # query síncrona (com tools)
POST   /api/v1/ai/chat/stream                         # streaming SSE (sem tools)
GET    /api/v1/ai/status
GET    /api/v1/ai/monitoring/stats
```

### Standards de mobilidade

```
GET    /api/v1/gtfs-rt/vehicle-positions.pb           # GTFS-RT VehiclePositions
GET    /api/v1/gtfs-rt/trip-updates.pb                # GTFS-RT TripUpdates
GET    /api/v1/netex/export.xml                       # NeTEx export
GET    /api/v1/catalog/datasets                       # DCAT-AP catalog
GET    /api/v1/open-data/lines.geojson                # GeoJSON linhas
GET    /api/v1/open-data/stops.geojson                # GeoJSON paragens
```

### Dev tools (apenas perfil `dev`)

```
POST   /api/v1/dev/quick-duty?busId=X&minutes=1       # escala teste de 2 trips
GET    /api/v1/dev/quick-duty/eligible-buses
```

---

## 10. Variáveis de ambiente

`.env.example` no root tem todas as defaults. Para customizar:

```bash
cp .env.example .env
# Edita .env conforme necessário
```

Mais importantes:

| Variável | Default | Descrição |
|---|---|---|
| `OLLAMA_MODEL` | `qwen2.5:3b` | Modelo Ollama a usar. 3B precisa ~3GB RAM. |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | URL interna do container Ollama |
| `PGU_TICKET_SALT` | `dev-salt-...` | Salt para pseudonimização de cartões (RGPD) |
| `KEYCLOAK_REALM` | `pgu-realm` | Realm OIDC |
| `OSRM_URL` | `http://osrm:5000` | URL do OSRM para routing |
| `MQTT_BROKER` | `tcp://mosquitto:1883` | Broker MQTT interno |

---

## 11. Desenvolvimento

### Frontend (hot-reload)

```bash
cd pgu-web
npm install
npm run dev          # Vite em http://localhost:5173
```

O proxy do Vite (`vite.config.js`) redirecciona `/api/v1` e `/ws-telemetry` para o backend em `localhost:8081`.

### Backend (rebuild apenas o backend)

```bash
docker compose build spring-boot-backend
docker compose up -d --force-recreate spring-boot-backend
```

### Logs em tempo real

```bash
docker compose logs -f spring-boot-backend
docker compose logs -f ollama
docker compose logs -f mosquitto
```

### Aceder à BD

```bash
docker compose exec postgres_postgis psql -U pgu_dw -d pgu_datawarehouse
```

### Simulador de telemetria

```bash
docker compose up -d simulator     # inicia 12 buses simulados
docker compose logs -f simulator   # ver telemetria a sair
```

---

## 12. Standards e interoperabilidade

| Standard | Suporte |
|---|---|
| **Transmodel CEN/TS 16614** | Modelo de dados nativo |
| **GTFS** | Import/export bidireccional |
| **GTFS-Realtime** | VehiclePositions + TripUpdates (`.pb`) |
| **NeTEx** | Export XML compatível com Europa |
| **DCAT-AP** | Catálogo Open Data indexável por dados.gov.pt |
| **GeoJSON** | Linhas + paragens (Open Data) |
| **OAuth2 / OIDC** | Via Keycloak; SSO-ready |
| **MQTT 3.1.1** | Painéis DMS e telemetria de bordo |
| **OpenAPI 3.1** | Swagger UI gerado automaticamente |

---

## 13. Documentação detalhada

- **[PLANO_ITERACAO.md](./PLANO_ITERACAO.md)** — Histórico completo de sprints com decisões de design e troca de stack.
- **[docs/RELATORIO_BUILD.md](./docs/RELATORIO_BUILD.md)** — Relatório técnico de build final: como criar linha + padrão, escalar bus, validar bilhete, configurar painel DMS, integrar NiFi + MQTT.
- **[docs/PGU-TUB-Apresentacao.pptx](./docs/PGU-TUB-Apresentacao.pptx)** — Apresentação comercial (17 slides).
- **Swagger** — Documentação interactiva em `http://localhost:8081/swagger-ui.html` quando o backend estiver a correr.

---

## Licença

MIT. Ver `LICENSE`.

## Equipa

Projecto académico DAI · Engenharia Informática · Universidade do Minho · 2025-2026.
