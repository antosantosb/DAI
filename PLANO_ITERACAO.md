# Plano de Iteração — PGU TUB

Documento **master** de planeamento da Plataforma de Gestão Urbana dos Transportes Urbanos de Braga (PGU TUB). Cobre 100% dos requisitos verticais (Secção 3 do caderno de encargos) e os requisitos da Secção 2.x necessários ao âmbito.

**Referência:** `202526_DAI-DesafioCliente.pdf` (caderno de encargos DAI 2025/26).

**Este documento substitui** `AUDITORIA_FEATURES.md` — todo o seu conteúdo está integrado abaixo, com os findings verificados de forma adversarial contra o código real (ver Anexo A).

---

## 1. Como Ler este Documento

- É a **única fonte de verdade** para o que está planeado e para os problemas conhecidos.
- Está organizado em: contexto e decisões (§2–§5), gaps (§6), plano executável por sprints (§7), funcionalidades extra BRT-style (§8), anexos com findings detalhados e dependências (§9), próximos passos (§10).
- Cada sprint lista, para cada item: requisito do caderno (`R.XXX`), identificador de finding (`SEC-1`, `BE-3`, `FE-7`, `INFRA-2`) que aponta para o Anexo A, esforço estimado e dependências.

**Convenções de marcadores:**
- `[CRITICO]` `[ALTO]` `[MEDIO]` `[BAIXO]` — severidades
- `[CONFIRMED]` finding confirmado por leitura direta do código
- `[FALSE-POSITIVE]` finding rejeitado após verificação (ver Anexo B — não esquecer que estes foram considerados e descartados)
- `[CONFIRMED-COM-AJUSTE]` confirmado mas o fix original foi refinado
- `[OK]` componente sem problemas
- `[GAP]` em falta
- `[PARTIAL]` parcial

---

## 2. Sumário Executivo

A plataforma tem uma **base funcional sólida**: telemetria em tempo real (MQTT → NiFi → backend → WebSocket), GTFS interno, gestão de frota, despacho operacional, ocorrências com workflow, analíticas básicas (Metabase + Recharts), Keycloak para SSO, FIWARE Orion via NiFi para NGSI-LD, Zero Trust por micro-segmentação de redes Docker.

**Os principais gaps** estão concentrados em três blocos:

1. **Verticais ausentes ou rudimentares** (3.2 Material Circulante, 3.3 Bilhética, 3.6 Carregadores, parcialmente 3.4 e 3.5).
2. **Camadas transversais críticas** em falta (Smart Data Models oficiais, NGSI-LD exposto pelo backend, GTFS-RT, gestão de fontes de dados, MFA, backups, monitorização, i18n, tema escuro).
3. **Hardening de segurança** que se acumulou (WebSocket público, MQTT anónimo, API key vulnerável a timing attack, **conflito CORS+credentials que partia silenciosamente JWT em browsers** — descoberto durante auditoria adversarial).

**Plano** — 11 sprints sequenciais (Sprint -1 hardening → Sprint 8b polish), totalizando **~16-18 semanas** para 1 dev full-time. Critical path passa por verticais com dependências de dados (S1→S2→S4→S5); S3 e S6 são paralelizáveis se houver 2 devs.

**Decisões-chave** já tomadas (ver §4 e §5):
- **GTFS interno** sem Airflow (decisão fundamentada — `GtfsService` + `GtfsScheduler` em Spring expõe controlo no backoffice).
- **Plataforma fechada** para uso interno dos TUB (sem Portal Público para cidadãos — pode aproveitar website TUB existente).
- **Bilhética híbrida** Conventional (cartão TUB tap-in) + Mobile QR (avulso) — acessibilidade a idosos primeiro.
- **IA on-premises** com Ollama + Llama 3.1 + tools restritas (RGPD/NIS2-compliant).

---

## 3. Estado Atual da Plataforma

### 3.1 Componentes operacionais

| Componente | Estado | Notas |
|---|---|---|
| Backend Spring Boot 4.0.5 (Java 21) | `[OK]` | 14 controllers REST documentados em OpenAPI |
| Frontend React 19 + Vite + Leaflet 1.9 + Recharts + STOMP | `[OK]` | 19 páginas (1 órfã — Drivers.jsx) |
| Keycloak 26 realm `pgu-realm` | `[OK]` | Roles: `admin`, `operador`, `maintenance`, `driver`, `dev` |
| PostgreSQL 15 + PostGIS 3.4 (DW) | `[OK]` | Migrações Flyway V1–V24 |
| FIWARE Orion 3.9 + MongoDB | `[OK]` | Recebe entidades NGSI-LD do NiFi |
| Eclipse Mosquitto | `[PARTIAL]` | Sem autenticação `[SEC-1]` |
| OSRM self-hosted Portugal | `[OK]` | Build lento (~600MB download) `[INFRA-4]` |
| Metabase | `[OK]` | Sem SSO Keycloak |
| Simulador Python | `[OK]` | Montado no NiFi |
| AOP audit (`@LogActivity` → `audit_log`) | `[OK]` | |
| AlertaService (email + WS + histórico) | `[OK]` | Thresholds parcialmente configurados |
| GTFS própria (`GtfsService` + scheduler + UI + revert) | `[OK]` | Decisão arquitetural — ver §4.1 |

### 3.2 Componentes parciais ou ausentes

Detalhados em §6. Resumo: ~50% dos requisitos do caderno cobertos.

---

## 4. Decisões Arquiteturais Tomadas

### 4.1 Ingestão GTFS interna (em vez de Apache Airflow)

**Decisão:** manter `GtfsService` + `GtfsScheduler` interno em Spring Boot. **Não introduzir Apache Airflow.**

**Justificação:**
- O servidor Azure tem recursos limitados (tier free/student). Airflow + workers + DB próprio consome >500 MB RAM em idle.
- Âmbito de orquestração ETL real é restrito (essencialmente GTFS-sync periódico). Não compensa complexidade operacional.
- Vantagens da abordagem interna:
  - Controlo fino exposto no backoffice (`GtfsManager.jsx`).
  - Histórico de imports com revert nativo no DW.
  - Progresso em tempo real via WebSocket.
  - Sem container adicional.

**Justificação para o caderno (R.ID.11):** o requisito recomenda Airflow "tal como referido na arquitetura de referência da ENTI". Apresentar alternativa fundamentada na restrição de recursos do ambiente, mantendo todas as capacidades exigidas (DAG-like flows, retry, monitoring, history) com Spring Scheduler + Spring Batch quando justificado. Para R.ID.12 (DAG) — apresentar o conceito implementado como "pipeline com fases independentes monitorizadas" (download → parse → validate → import → reconcile).

### 4.2 Plataforma fechada de consumo interno

**Decisão:** PGU é uma plataforma operacional interna dos TUB. **Não há registo de cidadãos. Não há acesso público a dados pessoais.**

**Implicações:**
- Vários requisitos da Secção 2.5.2 (Portal Público, Portal Dados Abertos com auto-registo) ficam fora do âmbito principal ou requerem adaptação.
- Federação com Autenticação.gov (R.AUT.03) é dispensável — utilizadores são funcionários TUB. Substituível por integração Keycloak ↔ Active Directory municipal (R.AUT.10).
- Portal de Dados Abertos pode ainda ser mantido por interesse público (publicar GTFS, indicadores agregados não-pessoais) — discutido em §5.3.

---

## 5. Decisões de Produto

### 5.1 Sistema de Bilhética

#### Análise das abordagens possíveis

| Modelo | Como funciona | Hardware | UX idosos | UX jovens | Dados | Complexidade |
|---|---|---|---|---|---|---|
| **Mobile ticketing** (convencional) | Compra prévia no app, QR/passe ao validador | Smartphone obrigatório | Mau | Bom | Compra + validação (1 evento) | Baixa |
| **CiCo** (Check-in / Check-out) | Tap-in + Tap-out | Validador físico ou app BLE | Médio (2 ações) | Bom | Origem + destino reais | Média |
| **CiBo** (Check-in / Be-out) | Tap-in, sistema deteta saída via beacons BLE | Beacons + smartphone/cartão BLE | Mau (smartphone BLE) | Bom | Origem + destino estimado | Alta |
| **BiBo** (Be-in / Be-out) | Totalmente passivo | Beacons + smartphone com app ativa | Inviável | Médio (drena bateria) | Origem + destino estimado | Muito alta |
| **Bilhete a bordo (papel)** | Venda direta pelo motorista, ETM imprime bilhete | Validador/impressora a bordo + gestão troco | Bom (familiar) | Bom (turistas) | Sale + serial sequencial | Baixa (mas exige reconciliação + anti-fraude) |

#### Decisão: **Tri-modal — Cartão TUB + Mobile QR + Bilhete a bordo (papel)**

A plataforma suporta três formas de validação/venda, cada uma servindo um perfil de utilizador. **Aprendizagens de operadores reais influenciaram a escolha:**

| Operador | Modelo | Lição |
|---|---|---|
| **CARRIS, STCP, TUB** (Portugal) | Cartão + mobile + papel a bordo | Bilhete avulso a bordo é expectativa cultural; é o que aplicamos |
| **TfL London** (pré-2014 vs hoje) | Removeu cash a bordo em 2014 por **fraude** + dwell time | Cautionary tale — sem deteção robusta, fraude obriga a remover canal inteiro |
| **Berlin BVG** | Cash + cartão + fiscalização aleatória (Schwarzfahrer-Kontrolle) | Validar com camada extra de auditoria humana |
| **RATP Paris** | Cross-check vendas ETM vs APC (automatic passenger counters) | Adoptamos: cruzar com `PassengerSensor` (S2) |
| **MTA NYC pre-MetroCard** | Driver cash + tear-off tickets | Documentou os 5 padrões clássicos de fraude que tratamos abaixo |
| **Singapore EZ-Link** | Cartão primário, cash backup | Hierarquia (cartão > mobile > papel) por preferência operacional |

#### Os três métodos suportados

1. **Cartão TUB físico** (`PASSE_MENSAL`, `PASSE_SENIOR`, `PASSE_ESTUDANTE`) — tap no validador embarcado. Captura: `cardPseudoId`, linha, timestamp, paragem estimada (via posição do bus). **Volume esperado: ~70% das validações** (utilizadores habituais).

2. **Mobile ticketing** (`BILHETE_AVULSO_MOBILE`) — utilizador compra avulso no app TUB → QR temporário → leitura no validador. **Volume esperado: ~15-20%** (utilizadores jovens, urbanos).

3. **Bilhete avulso a bordo** (`BILHETE_AVULSO_PAPEL`) — venda diretamente pelo motorista usando **ETM (Electronic Ticket Machine)** que imprime bilhete com serial sequencial, timestamp, linha, ID do motorista. Pagamento em numerário ou TPA. **Volume esperado: ~10-15%** (turistas, ocasionais, falhas técnicas, idosos não-titulares de passe).

#### Por que esta combinação

- **Acessibilidade universal.** Cobre 100% dos perfis: utilizadores habituais (cartão), digitais (mobile), turistas/ocasionais sem app nem cartão (papel). Nenhum cidadão fica excluído.
- **Coerência com prática TUB atual.** O bilhete a bordo já é vendido hoje — a PGU integra-o em vez de o ignorar. O sistema reflete a operação real, não impõe rutura.
- **Hardware existente.** Validadores e ETMs estão instalados. Apenas o backend é novo.
- **Resiliência operacional.** Se sistema mobile falhar, se cartão estiver bloqueado, ou se validador embarcado avariar — papel é fallback funcional.
- **Origem-destino estimada (R.IPB.05).** Tap-in + telemetria + sequência permite estimar O-D estatisticamente. Bilhetes em papel sem identificação contribuem para estatística agregada (linha/paragem/hora) mas não para padrões individuais — aceitável e RGPD-friendly.
- **Compatibilidade RGPD.** `cardPseudoId` pseudonimizado para cartão; QR descartável para mobile; **papel sem qualquer dado pessoal** (apenas serial + timestamp + linha + motorista).
- **Migração futura para CiCo possível.** Adicionar tap-out é mudança incremental (mesmo modelo de evento, novo flag `eventType=CHECK_OUT`).

#### Modelo de dados proposto

```sql
-- Tabela principal: validações + vendas (uma linha por evento, qualquer fonte)
CREATE TABLE ticket_validation (
    id              BIGSERIAL PRIMARY KEY,

    -- Comum a todas as fontes
    bus_id          VARCHAR(32) NOT NULL,
    route_id        BIGINT REFERENCES routes(id),
    stop_id         BIGINT REFERENCES bus_stops(id),     -- paragem inferida pela posição
    location        GEOMETRY(Point, 4326),
    validated_at    TIMESTAMPTZ NOT NULL,
    ticket_type     VARCHAR(32) NOT NULL,                -- PASSE_MENSAL, PASSE_SENIOR, PASSE_ESTUDANTE,
                                                          -- BILHETE_AVULSO_MOBILE, BILHETE_AVULSO_PAPEL
    source          VARCHAR(16) NOT NULL,                -- CARD, MOBILE_QR, ONBOARD_PAPER
    validation_result VARCHAR(16) NOT NULL,              -- OK, INVALID, EXPIRED, DUPLICATE

    -- Específico CARD
    card_pseudo_id  VARCHAR(64) NULL,                    -- SHA-256(cardReal + salt)

    -- Específico MOBILE_QR
    qr_token        VARCHAR(128) NULL,                    -- token descartável (já consumido após validação)

    -- Específico ONBOARD_PAPER
    paper_serial    VARCHAR(64) NULL,                     -- número sequencial impresso no bilhete
    etm_id          VARCHAR(32) NULL,                     -- ID da Electronic Ticket Machine
    driver_id       BIGINT NULL REFERENCES drivers(id),   -- motorista que emitiu
    payment_method  VARCHAR(16) NULL,                     -- CASH, MULTIBANCO_TPA
    amount_cents    INT NULL,                              -- preço pago (cêntimos)

    raw_payload     JSONB,                                 -- auditoria total da mensagem original

    CONSTRAINT chk_source_fields CHECK (
        (source = 'CARD'          AND card_pseudo_id IS NOT NULL) OR
        (source = 'MOBILE_QR'     AND qr_token       IS NOT NULL) OR
        (source = 'ONBOARD_PAPER' AND paper_serial   IS NOT NULL AND etm_id IS NOT NULL)
    )
);

CREATE INDEX idx_tv_route_time  ON ticket_validation(route_id, validated_at);
CREATE INDEX idx_tv_card_time   ON ticket_validation(card_pseudo_id, validated_at)
    WHERE card_pseudo_id IS NOT NULL;
CREATE INDEX idx_tv_etm_serial  ON ticket_validation(etm_id, paper_serial)
    WHERE paper_serial IS NOT NULL;
CREATE INDEX idx_tv_driver_time ON ticket_validation(driver_id, validated_at)
    WHERE driver_id IS NOT NULL;
CREATE INDEX idx_tv_location    ON ticket_validation USING GIST(location);

-- Tabela de reconciliação fim-de-turno (financeiro + anti-fraude)
CREATE TABLE paper_ticket_reconciliation (
    id                     BIGSERIAL PRIMARY KEY,
    driver_id              BIGINT NOT NULL REFERENCES drivers(id),
    bus_id                 VARCHAR(32) NOT NULL,
    etm_id                 VARCHAR(32) NOT NULL,
    shift_start            TIMESTAMPTZ NOT NULL,
    shift_end              TIMESTAMPTZ NOT NULL,
    serial_range_start     VARCHAR(64) NOT NULL,        -- primeiro serial do turno
    serial_range_end       VARCHAR(64) NOT NULL,        -- último serial do turno
    tickets_sold_count     INT NOT NULL,                 -- contagem de bilhetes em ticket_validation
    expected_revenue_cents INT NOT NULL,                 -- soma de amount_cents do turno
    reported_revenue_cents INT NULL,                     -- declarado pelo motorista no fim do turno
    discrepancy_cents      INT GENERATED ALWAYS AS
        (COALESCE(reported_revenue_cents, 0) - expected_revenue_cents) STORED,
    skipped_serials        TEXT[],                       -- gaps na sequência (cada gap = potencial fraude)
    fraud_flags            TEXT[],                       -- ex.: ['SEQUENCE_GAP','CASH_DISCREPANCY','UNDERSELL_VS_COUNTER']
    status                 VARCHAR(16) NOT NULL DEFAULT 'PENDING',
                                                          -- PENDING, RECONCILED, DISPUTED, FRAUD_INVESTIGATION
    reviewed_by            VARCHAR(64),
    reviewed_at            TIMESTAMPTZ,
    notes                  TEXT
);

CREATE INDEX idx_recon_driver_shift ON paper_ticket_reconciliation(driver_id, shift_end DESC);
CREATE INDEX idx_recon_status       ON paper_ticket_reconciliation(status, shift_end DESC)
    WHERE status != 'RECONCILED';
```

Compatível com Smart Data Model `Ticket` / `TransitTrip` da FIWARE.

#### Deteção de Fraude e Estatísticas

A componente de papel é a mais vulnerável a fraude operacional. A literatura (LTA Singapore, RATP Paris, MTA NYC) e prática de operadores identificam **5 padrões recorrentes**:

1. **Bolso do motorista** — recebe cash mas anula o bilhete; passageiro embarca sem registo.
2. **Impressora pulada** — motorista imprime ticket fora do sistema (mais discreto que anular).
3. **Bilhete reciclado** — passageiro entrega bilhete usado a outro; motorista revalida visualmente.
4. **Stack pré-impresso** — chega ao turno com bilhetes em branco impressos previamente.
5. **Clonagem de ETM** — equipamento alternativo emite bilhetes com formato idêntico mas serial fora do sistema.

**Detecção implementada** (regras base em Sprint 5, regras avançadas com IA em Sprint 7):

| # | Regra | Como detecta | Severidade | Sprint |
|---|---|---|---|---|
| 1 | **Sequence gap** | `expected_count = (serial_end - serial_start + 1)`. Se `tickets_sold_count < expected_count` → gaps no array `skipped_serials`. Cada gap = bilhete impresso sem registo. | ALTO | S5 |
| 2 | **Cash discrepancy** | `\|reported_revenue - expected_revenue\| > 100 cents` (tolerância 1€). MEDIO se < 5€; ALTO se ≥ 5€. | MEDIO–ALTO | S5 |
| 3 | **Duplicate serial cross-shift** | Mesmo `(etm_id, paper_serial)` em dois turnos diferentes = ETM clonada ou replay. | CRITICO | S5 |
| 4 | **Undersell vs APC sensor** | Cross-check com `PassengerSensor` (S2): `boarded_count_during_trip` vs `(tickets_sold + passes_validated)`. Desvio > 20% e > 5 passageiros não-justificados = flag. | ALTO | S7 (depende de S2) |
| 5 | **Driver pattern anomaly** | Histograma 30 dias: bilhetes vendidos por 100 passageiros, normalizado por linha/hora. Outlier > 2 desvios padrão = flag. | MEDIO | S7 (análise estatística) |
| 6 | **GPS-time mismatch** | Timestamp do bilhete + ETM location declarada vs `vehicle_telemetry` ±60s. Distância > 500m = flag (pode ser dessincronização ou fraude). | BAIXO | S7 |

**Captura de identidade do motorista (`driver_id`):**

A `ETM` publica apenas `busId` (identidade do veículo). O backend resolve `driver_id` no momento da ingestão consultando `driver_bus_assignment` ativa para esse bus (a que tem `active = true`, criada quando o motorista fez login no painel de bordo do tablet). Se não houver assignment ativo no momento da venda → flag de auditoria `NO_DRIVER_ASSIGNED` (caso raro: motorista esqueceu login). Esta resolução garante que **bilhetes papel ficam sempre ligados ao motorista** que estava em turno, sem a ETM precisar de saber a identidade (mantém hardware burro).

**Como os dados entram no sistema:**

A `ETM` (impressora a bordo) liga-se à PGU de uma de três formas (em ordem de preferência):

- **A) Tempo real via MQTT** (preferida) — cada venda publica imediatamente em `tub/ticket/sale`. NiFi consome, transforma e ingere via `POST /api/v1/validations` com `source=ONBOARD_PAPER`. Latência: <5s. **É o padrão que adotamos** porque mantém o Live Map consistente e permite detecção de fraude próximo de tempo real.
- **B) Upload periódico** (5-15 min) — ETM acumula buffer local, envia batch quando WiFi/4G disponível. Fallback para zonas com má cobertura.
- **C) Fim de turno** (deposit) — apenas no depot, ETM descarrega via cabo. Pior caso; usado se A e B falharem por hardware.

**Reconciliação fim-de-turno:**

Quando motorista termina turno:
1. ETM imprime "Z-report" com `serial_range`, `tickets_sold_count`, `expected_revenue`.
2. Sistema interno PGU recebe o Z-report e cria registo `paper_ticket_reconciliation` com `status=PENDING`.
3. Motorista entrega cash no escritório; valor é introduzido em `reported_revenue_cents`.
4. Job `PaperTicketFraudDetector` corre as 6 regras automaticamente, popula `fraud_flags`.
5. Se `fraud_flags` vazio → `status=RECONCILED`. Se não → `status=DISPUTED` e notifica supervisor.
6. Supervisor revê em `ReconciliationDashboard.jsx`, pode marcar como falso positivo (`notes`) ou escalar (`status=FRAUD_INVESTIGATION`).

**Estatísticas adicionais geradas** (extensões ao `TicketingDashboard` em S5 e S7):

- Distribuição de validações por **fonte** (CARD / MOBILE_QR / ONBOARD_PAPER) por hora/linha/zona.
- **Heatmap geográfico** de vendas papel — identifica zonas turísticas (centro Braga, Bom Jesus), paragens problemáticas.
- **Top 10 motoristas por discrepância** acumulada (mensal) — para revisão proativa pela manutenção/RH.
- **Tendência mensal** de fraude detectada vs reconciliada — KPI de saúde do canal de venda.
- **Taxa de skipped serials por ETM** — indicador de manutenção de equipamento (papel encravado vs fraude).
- **Cross-validation report**: bilhetes papel vendidos vs ocupação real do bus (R.ICP cruzamento) — comprova R.IPB.04 do caderno ("correlacionamento com dados operacionais").
- **Conversão papel → cartão**: % de utilizadores que após N viagens em papel adquirem passe — input para campanhas comerciais (futuro).

### 5.2 IA / Chatbot com Privacidade

#### Problema

O caderno exige IA (R.IA.01–07, 2.5.2.3) mas também conformidade rigorosa com RGPD, Lei 58/2019 e NIS2 (R.SEC.04, R.SEC.08, 2.8). Qualquer envio de dados para LLM em cloud (OpenAI, Anthropic, etc.) cria dependência externa e potencial fuga de dados sensíveis (telemetria, alertas, padrões de utilização).

#### Solução: **LLM on-premises com camada de anonimização e tools restritas**

**Arquitetura lógica:**

```
┌──────────────────────────────────────────────────────────────────┐
│ BROWSER (operador)                                               │
│  Chatbot.jsx — banner "IA generativa, Llama 3.1 on-premises"     │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTPS + JWT
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ SPRING BOOT — AiChatController                                   │
│  - Verifica role (admin/operador)                                │
│  - Audit log da pergunta                                         │
│  - Chama AiToolRouter                                            │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ AiToolRouter — lista fechada de tools (read-only, agregadas)     │
│  - getFleetOccupancyByHour(date_range)                           │
│  - getRouteDelayStats(route_id, date_range)                      │
│  - getActiveAlerts(severity_min)                                 │
│  - getGtfsSchedule(stop_id)                                      │
│  - getEnergyConsumptionStats(date_range)                         │
│  - getChargingUtilizationStats(date_range)                       │
│  - getHeadwayStats(route_id)                                     │
│  - getOcorrenciasOpenCount(filters)                              │
│  - getTopProblematicVehicles(window)                             │
│  - getServiceAlerts(active)                                      │
│  NUNCA: SQL livre, dados pessoais, registos individuais          │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ OLLAMA (container, rede ai_net SEM internet)                     │
│  - llama3.1:8b ou mistral:7b                                     │
│  - Function calling para invocar tools                           │
│  - Resposta em linguagem natural                                 │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
                 Resposta + disclaimer
                         │
                         ▼
              Audit log + UI rendering
```

Rede `ai_net` no Docker isolada — Ollama não tem rota para internet, só comunica com o backend. Pesos do modelo baixados uma vez no build do container.

**Conformidade:**

| Requisito | Como é cumprido |
|---|---|
| R.IA.01 EU AI Act 2024/1689 | Modelo open source (Llama 3.1, Apache 2.0), pesos auditáveis, nenhum upload de dados pessoais para terceiros |
| R.IA.02 Catalogação | Banner permanente "IA generativa — Llama 3.1 on-premises" em todas as páginas com IA |
| R.IA.03 Não-indução em erro | Disclaimer em cada resposta + avisos sobre limitações |
| R.IA.04 MLOps + observabilidade | Dashboard com métricas + audit log integral (`ai_interaction_log`) |
| R.IA.05 Equidade/imparcialidade | Modelo open source com cartão de modelo publicado pela Meta; tools restritas eliminam viés operacional |
| R.IA.06 Controlos e relatórios qualidade | Evals periódicas com prompts fixos comparando respostas (script mensal) |
| R.IA.07 Exportação não-proprietária | Pesos GGUF do Llama via repositório oficial Ollama |

**RGPD / Lei 58/2019:** o LLM nunca vê dados pessoais (cartões pseudonimizados, sem nomes); tudo agregado. DPIA simplificado — listar tools, indicar que não processam dados pessoais identificáveis.

**NIS2:** modelo local, sem dependência externa crítica, audit log integral, separação de redes.

### 5.3 Requisitos Fora de Scope (com Justificação)

| Requisito | Justificação |
|---|---|
| **R.PP.01–14** — Portal Público | Plataforma é interna. Funcionalidade pública delegada ao website existente dos TUB. *Pode manter-se versão minimalista (R.PP.04 KPIs + R.PP.11 horários) num Portal de Dados Abertos se quisermos pontuar* |
| **R.PDA.05, R.PDA.07, R.PDA.13–15** — Workflow editorial CKAN | Para um Portal de Dados Abertos minimalista, basta publicar GTFS + telemetria agregada. Workflow editorial é overkill |
| **R.AUT.03** — Autenticação.gov | Utilizadores são funcionários TUB. Substituir por integração Keycloak ↔ Active Directory municipal (R.AUT.10) |
| **R.AUT.13** — Federação Google/Microsoft/Facebook/GovID | Plataforma interna; permitir apenas Microsoft Entra ID empresarial via Keycloak |
| **R.UI.26** — Edifícios 3D | Sem valor operacional num projeto de transportes; sobrecarrega o mapa |
| **R.UI.11–22** — Gestor SIG full (filtros espaciais hierárquicos, partilha entre utilizadores, etc.) | Implementar versão minimalista (toggle camadas, filtros simples); SIG completo fora do âmbito de transportes operacionais |
| **R.CLOUD.04, R.CLOUD.08** — Load Balancer + HA | Restrição do ambiente Azure free/student. Documentar como recomendação para produção |
| **R.DL.04 (Data Lake puro)** — armazenamento federado para dados não estruturados massivos | **Revisto:** S3-compatible storage (MinIO) entra no Sprint 0 (Fase 0) para suportar exports assíncronos, attachments em ocorrências, fotos de avarias dos motoristas e futuros backups. Data Lake "puro" full (federação, particionamento massivo, lifecycle policies) fica como evolução futura. |
| **R.DL.07** — Replicação síncrona/assíncrona com failover | Single-node. Documentar como prod-only |
| **R.IA.04** — MLOps full | Implementar versão mínima (métricas básicas, audit log). MLOps full não justificável no scope |
| **R.AN.19** — Análises preditivas full ML | Implementar **um** modelo simples (forecasting com ARIMA). Forecasting profundo fora |

Estes requisitos devem ser **mencionados no relatório final como decisões fundamentadas**, não simplesmente omitidos.

---

## 6. Compilação de Gaps por Requisito

### 6.1 Verticais 3.1–3.6

#### Vertical 3.1 — Transportes Públicos
- **GTFS-RT** não publicado (apesar de o caderno introduzir GTFS+GTFS-RT). Gap crítico.
- **Transmodel/NeTEx/SIRI** (R.IVT.02, R.IVT.11) — modelo de dados não é Transmodel; falta exporter NeTEx.
- **Entidade `Operator`** (R.IVT.03) — falta no domínio.
- **API normalizada AMA** (R.IVT.09) — endpoint para Catálogo Nacional ausente.
- **Calendário operacional** (R.IVT.05) — vista por dia/semana ausente.
- **Indicadores cobertura/frequência** (R.IVT.06) — não calculados.

#### Vertical 3.2 — Material Circulante
- **Inteiro vertical ausente.** Telemetria atual é GPS+ocupação, não diagnóstico veicular.
- Sem entidades `VehicleDiagnostic`, `VehicleOperation`, `VehicleAlert`.
- Sem dashboard técnico (MTBF, MTTR, consumo, bateria, falhas).
- Sem fonte de dados real (CAN/OBD) → **resolver com simulação realista**.

#### Vertical 3.3 — Bilhética
- **Inteiro vertical ausente.** Decisão de modelo em §5.1.
- Sem entidades `Ticket`, `TicketValidation`, `Card`.
- Sem dashboards de procura, estimativa O-D.

#### Vertical 3.4 — Contagem de Passageiros
- **Granularidade** — atual é "passengerCount agregado por bus", falta entradas/saídas por porta/paragem (R.ICP.01).
- **Inventário de sensores** (R.ICP.07) ausente.
- **Thresholds de ocupação** (R.ICP.05) — framework existe, não está configurado.
- **Smart Data Model `PassengerCount`** não usado.

#### Vertical 3.5 — Painéis Mensagem Dinâmica
- **Estado dos equipamentos** (R.IPM.01) — apenas há `panelMessage` por paragem.
- **Tipos de painel** (R.IPM.04) — e-paper/LED/TFT/embarcado não modelados.
- **Dashboards monitorização DMS** (R.IPM.05) ausentes.
- **Ingestão de alarmes DMS** (R.IPM.06) ausente.

#### Vertical 3.6 — Carregadores Elétricos
- **Inteiro vertical ausente.** Apenas o conceito de `tipoAtivo = CHARGER` existe nas ocorrências.
- Sem entidade `ChargingStation`, sem `ChargingSession`.
- Sem dashboard, sem ingestão.
- Resolver com simulação (Mobi.E + 3 plataformas frota internas).

### 6.2 Componentes 2.x com impacto direto nos verticais

| ID | Requisito | Impacto |
|---|---|---|
| R.INT.01 | Smart Data Models oficiais | Cobre R.IMC.09, R.ICP.10, R.IPB.10, R.IPM.10, R.ICE.08-09 |
| R.INT.06 | APIs NGSI-LD expostas pelo backend | Cobre R.IMC.07, R.ICP.08, R.IPB.09, R.IPM.09, R.ICE.10 |
| R.ID.01-09 | Gestão de fontes de dados (UI) | Necessário para gerir GTFS, telemetria, bilhética, contagem, DMS, carregadores |
| R.AN.04 | Exportação Excel | Multi-vertical |
| R.SEC.04 | RGPD com anonimização | Crítico para bilhética |
| R.BAC.01-09 | Backups | Crítico para conformidade |
| R.CLOUD.05 | Monitorização (Prometheus/Grafana) | Suporta dashboards de IA, ingestão, performance |
| R.BO.09 | Multi-idioma | Acessibilidade (PT/EN) |
| R.UI.31 | Tema escuro | Acessibilidade |

---

## 7. Plano de Iteração — Sprints

Cada sprint tem duração indicativa indicada. Esforços em horas (1 dev FT). Para cada item listo:
- Requisito do caderno coberto
- Finding ID (`SEC-x`, `BE-x`, `FE-x`, `INFRA-x`) que aponta para Anexo A
- Esforço estimado
- Dependências

**Ordem dos sprints fundamentada em análise de dependências (Anexo F):**

```
S-1 (HARDENING) → S0 (FUNDAÇÕES) → S1 (3.1) → S2 (3.4 + fundação 3.3 + particionamento)
                                              ↘ S3 (3.5) ← paralelizável
                                                → S4 (3.2) → S5 (3.3) → S6 (3.6) ← paralelizável com S5
                                                                                  → S7 (IA + BRT)
                                                                                  → S8a (conformidade)
                                                                                  → S8b (qualidade)
```

---

### Sprint -1: Hardening de Segurança e Quick Wins (CONCLUÍDO)

**Duração efetiva:** ~5 dias. **Estado:** entregue e em `main`.

**Objetivo (cumprido):** fechar todos os críticos de segurança identificados na auditoria adversarial (Anexo A §A.1), aplicar 25+ quick wins de alto valor e estabelecer fundações de configuração (`GlobalExceptionHandler`, profiles Spring) antes do Sprint 0 introduzir features que dependem delas.

#### Status final por fase

Sequência cronológica de commits no histórico `main` (`git log --grep="Sprint -1" --oneline`):

| Fase | Commit | Conteúdo entregue |
|---|---|---|
| 1/9 | `97e93e6` | **Foundations:** CORS apertado (lista explícita de headers, fix `setAllowedHeaders("*") + allowCredentials=true`), `GlobalExceptionHandler` + `ErrorResponse` tipado, `application-prod.properties` (logging WARN, HikariCP pool 30, graceful shutdown, compression), `spring-boot-starter-validation`, actuator restrito (`health`, `info`, `mail` desativado), springdoc 2.5.0 para 2.8.13 (compat Spring Boot 4). |
| 2/9 | `7c93f37` | **Backend pure fixes:** `InternalApiKeyFilter` com `MessageDigest.isEqual` (timing-safe), batch validation com `@Min`/`@Max` em `BusController`, audit log sem `e.getMessage()` em INFO. |
| 3/9 | `0c038af` | **Performance:** V28 com índices compostos em `vehicle_telemetry(bus_id, recorded_at)`, `ocorrencias(estado, timestamp_abertura)`, `ocorrencias(ativo_id, estado)`, `mensagens_despacho(bus_id, timestamp_envio)`. |
| 4/9 | (consolidado em 5/9) | **WebSocket origins:** `setAllowedOrigins(allowedOrigins)` config-driven em vez de `"*"`. |
| 5/9 | `d5a6035` | **WebSocket JWT (SEC-4):** `WebSocketSecurityConfig` + `ChannelInterceptor` que valida o JWT no frame STOMP `CONNECT`. `pgu-web/src/services/stompClient.js` factory com `beforeConnect` que faz `keycloak.updateToken(30)` e injeta `Authorization` em `client.connectHeaders`. |
| 6/9 | `052a36a` | **Mosquitto MQTT auth (SEC-1):** `allow_anonymous false`, `mosquitto_passwd` gerada no boot a partir de env vars, ACL por user (`backend`, `simulator`, `nifi`, `bus`). Atualizado `MqttDespachoService`, NiFi process group, `simulator.py`. |
| 7/9 | `0a9f84e` | **Nginx hardening:** HSTS, CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `proxy_ssl_verify on` para NiFi, rate-limit em `/api/` (20 r/s) e `/auth/` (5 r/s). |
| 8/9 | `76a7ce0` | **Frontend quick wins:** `Modal` com `role="dialog"`, `aria-modal`, focus trap e restauro de foco; `aria-label` em NavLink; `Stops.jsx` substitui `window.confirm()` por `Modal`; axios com `timeout: 15000` e handlers globais 401/403/ECONNABORTED com toast. |
| 9/9 v1 | `a49c30b` | **SEC-7 tentativa 1:** parametrizar passwords Keycloak via env vars com entrypoint custom mais `sed` a substituir placeholders no realm JSON. Funcional, mas considerado over-engineered para o âmbito académico. |
| 9/9 v2 | `b7c82a7` | **SEC-7 decisão final:** users do realm com `temporary: true` mais `requiredActions: ["UPDATE_PASSWORD"]`. Mecanismo nativo do Keycloak, zero código, força mudança no primeiro login. |

#### Follow-ups depois do "fim formal"

| Commit | Conteúdo |
|---|---|
| `992f997` | `pgu-setup.sh` atualizado com novas env vars (MQTT por serviço, geração de `.env` local). |
| `a825764` | **Cleanup do repo:** removidos `UC6`, `UC7`, `docs/architecture-simulation-drivers.md`, `keycloak/entrypoint-with-envsubst.sh` e todas as refs a Airflow. |
| `729a248` | **README reescrito de raiz**, alinhado com o estado pós Sprint -1. |
| `694c93e` | **Tema Keycloak, cleanup do realm, fixes README:** CSS do tema PGU cobre a página `login-update-password.ftl` (botões submit genéricos, instruction text, `#kc-page-title`, wrapper `#kc-form-buttons`). Users `operador` e `motorista` removidos do realm (apenas `admin` pré-criado, restantes contas via backoffice). `/livemap` corrigido para "Autenticado". Curso corrigido para LEGSI. Footer 2025 para 2026. |

**Total:** 13 commits em `main` (fases 1 a 9 mais follow-ups).

#### Deviações ao plano original

1. **SEC-7 (Keycloak passwords) simplificado.** Plano original: criar users via Admin API no boot com password UUID. Implementação inicial usou `sed` mais entrypoint custom (commit `a49c30b`), revertida por complexidade. Solução final (commit `b7c82a7`): `temporary: true` no realm JSON, mecanismo nativo do Keycloak, zero código. **Mais simples, mais segura, mais idiomática.**

2. **SEC-5 (Painel de Bordo) sem QR pairing.** Plano previa QR pairing para o tablet do bus. Decisão final (registada antes do início): login Keycloak normal com role `motorista` e auto-deteção do bus via `driver_bus_assignment` (admin atribui no backoffice). QR pairing rejeitado por over-engineering para o âmbito académico, com perda de captura de identidade do motorista necessária para bilhética papel, reconciliação e regra 5 de fraude. Ver Anexo G.

3. **Realm cleanup retroativo.** Os 3 users iniciais (`admin`, `operador`, `motorista`) com passwords `temporary` ficavam visíveis no repo. Decisão: manter só `admin` pré-criado (com `temporary: true` mais `UPDATE_PASSWORD`); restantes contas criadas pelo admin via `/backoffice/users` e `/backoffice/drivers`. Roles `operador` e `motorista` continuam definidas no realm.

4. **Tema Keycloak completado.** A CSS do tema PGU só cobria a página de login. Páginas geradas pelos `requiredActions` (mudança de password, futuro TOTP setup) apareciam unstyled. CSS estendido a todos os `button[type="submit"]`, `.btn-primary`, `#kc-page-title`, `.instruction` e `#kc-form-buttons`.

5. **`/livemap` não é público.** O README inicialmente listou `/livemap` como rota pública. Foi corrigido para "Autenticado": está envolvido em `<ProtectedRoute>` no `App.jsx`. Caso se decida torná-lo público num sprint futuro, fica explicitamente documentado.

#### Saída do Sprint -1

- ✅ Plataforma segura para demonstração externa (MQTT, WebSocket, CORS, API key, Nginx, Modal e Keycloak passwords todos hardened).
- ✅ Fundação de erro tipado (`GlobalExceptionHandler` mais `ErrorResponse`) em vigor.
- ✅ Profiles Spring split (`application.properties` mais `application-prod.properties`) em vigor.
- ✅ Repositório limpo (sem Airflow, sem UC6/UC7, sem ficheiros stale).
- ✅ README de raiz alinhado com o estado real do projeto.
- ✅ Quick wins de qualidade aplicados antes de adicionar features novas no Sprint 0.

---

### Sprint 0: Fundações Transversais (CONCLUÍDO)

**Duração efetiva:** ~3 semanas (estimativa ~49h, real ~80h com follow-ups). **Estado:** entregue e em `main`.

**Objetivo (cumprido):** criar as camadas que TODOS os verticais subsequentes vão reutilizar. Mais um conjunto significativo de melhorias UX/profissionais (i18n PT/EN total, tema escuro completo, polish Livemap, exports em MinIO, self-service de conta, avatares, batch drivers) que reforçam a entrega final.

#### Requisitos 2.x cobertos

- **R.INT.01:** Smart Data Models como referência canónica (renomear `Vehicle` no NiFi Jolt, adicionar `@context`).
- **R.INT.06:** endpoint proxy NGSI-LD no backend (`GET /api/v1/ngsi-ld/entities`, `GET /api/v1/ngsi-ld/entities/{id}`).
- **R.ID.01 a R.ID.09:** entidade `DataSource` mais página backoffice "Fontes de Dados".
- **R.UI.03, R.UI.10:** cluster e camadas base, terreno e satélite no Livemap.
- **R.UI.31:** tema escuro (CSS variables já existem em `index.css`).
- **R.BO.09:** i18n PT/EN com `react-i18next`.
- **R.BO.05:** email no fim do export (assíncrono, com link MinIO).
- **R.AUT.04:** MFA TOTP no Keycloak.
- **R.DL.04 (revisto):** infraestrutura S3-compatible (MinIO) para exports, attachments, avatares e futuros backups.

> **Decisão revista vs plano anterior:** o plano original (linha 363) colocava Data Lake / MinIO como "evolução futura". Foi promovido a Fase 0 do Sprint 0 porque (a) a Fase 9 (export assíncrono) depende dele, (b) ocorrências e mensagens de despacho vão precisar de attachments nos sprints seguintes, (c) o custo de adicionar agora é baixo (~5h) face ao custo do refactor posterior.

> **Decisão revista vs plano anterior:** o plano original assumia que o `JavaMailSender` ficaria "ligado a um SMTP real depois". Para o âmbito académico foi adotado **Mailpit em Docker** (captura SMTP local com web UI em `:8025`), incluído na Fase 0. Em produção bastará trocar `SMTP_HOST` para Gmail App Password, SendGrid ou similar (sem alterações no código).

#### Estrutura por fases (10 fases, 1 commit cada)

Sequência por dependências (independentes primeiro) e por importância dentro de cada nível:

| # | Fase | Esforço | Depende de |
|---|---|---|---|
| F0 | **Mailpit mais MinIO infra** | ~5h | nenhuma |
| F1 | **Routes manifest, lazy loading, ProtectedRoute com `requiredRole`, página 403, axios 403** | ~5h | nenhuma |
| F2 | **Observabilidade backend** (Micrometer Prometheus, `api_access_log`, Caffeine, AbortController) | ~5h | nenhuma |
| F3 | **NGSI-LD proxy mais Smart Data Model `Vehicle` oficial** | ~5h | nenhuma |
| F4 | **DataSource, health, UI, alarmes** | ~8h | F1, F2 |
| F5 | **MFA TOTP no Keycloak** | ~2h | nenhuma |
| F6 | **i18n PT/EN com `react-i18next`** | ~8h | nenhuma |
| F7 | **Tema escuro** | ~3h | nenhuma |
| F8 | **Livemap polish** (cluster mais camadas base, terreno, satélite) | ~3h | nenhuma |
| F9 | **Export assíncrono mais email** | ~5h | F0 |

**Esforço total:** ~49h.

#### Entregáveis por fase

**F0: Mailpit mais MinIO infra**
- `docker-compose.yml`: serviços `mailpit` (porta 8025 web UI, 1025 SMTP) e `minio` (porta 9000 API, 9001 console), com healthchecks e rede dedicada `storage_net`.
- `.env` e `.env.example`: novas vars (`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_EXPORTS_BUCKET`, `MINIO_ATTACHMENTS_BUCKET`).
- `pgu/pom.xml`: dependência `io.minio:minio-java`.
- `pgu/src/main/java/dai/tub/pgu/config/MinioConfig.java`: cliente `MinioClient` mais bean.
- `pgu/src/main/java/dai/tub/pgu/service/StorageService.java`: `upload`, `download`, `presignedUrl(bucket, key, ttl)`, `delete`.
- `pgu/src/main/java/dai/tub/pgu/config/StorageBootstrap.java`: cria buckets `exports` e `attachments` no boot se não existirem.
- `application.properties`: `SMTP_HOST` default `mailpit`, `SMTP_PORT` default `1025`.

**F1: Routing e Permissions Foundation**
- `pgu-web/src/routes.js`: lista canónica de rotas (path, component, roles, navLabel, icon).
- `pgu-web/src/App.jsx`: itera `routes` mais `React.lazy()` mais `<Suspense>`.
- `pgu-web/src/components/Layout.jsx`: itera `routes` filtradas por role para o nav.
- `pgu-web/src/components/ProtectedRoute.jsx`: aceita prop `requiredRole`, compara com claims do JWT, redireciona para `/403` se faltar.
- `pgu-web/src/pages/Forbidden.jsx` mais `Forbidden.css`: nova página `/403` com mensagem e botão voltar.
- `pgu-web/src/services/api.js`: interceptor 403 com toast "Sem permissão".

**F2: Observabilidade**
- `pgu/pom.xml`: `micrometer-registry-prometheus` mais `com.github.ben-manes.caffeine:caffeine`.
- `application.properties`: `management.endpoints.web.exposure.include=health,info,prometheus`, cache config.
- `pgu/src/main/java/dai/tub/pgu/audit/ApiAccessLogFilter.java`: `OncePerRequestFilter` que regista cada chamada (ip, user, method, path, status, latency, user-agent).
- `pgu/src/main/resources/db/migration/V29__api_access_log.sql`.
- `@Cacheable` em `StopService.findAll()`, `RouteService.findAll()`, hot queries do GTFS.
- `pgu-web/src/pages/Livemap.jsx`: pattern AbortController em `useEffect` como referência para sprints seguintes.

**F3: NGSI-LD**
- `pgu/src/main/java/dai/tub/pgu/controller/NgsiLdProxyController.java`: `GET /api/v1/ngsi-ld/entities`, `GET /{id}`, `GET /types`. Devolve `Content-Type: application/ld+json`.
- `pgu/src/main/java/dai/tub/pgu/service/NgsiLdService.java`: tradução NGSI v2 para NGSI-LD v1.6 mais `@context` FIWARE oficial.
- `nifi-templates/*`: Jolt atualizado para Smart Data Model `Vehicle` oficial (https://github.com/smart-data-models/dataModel.Transportation/blob/master/Vehicle/schema.json).

**F4: DataSource**
- `domain/DataSource.java`, `repository/DataSourceRepository.java`, `controller/DataSourceController.java`, `service/DataSourceHealthService.java`.
- `db/migration/V30__data_source.sql` (id, nome, tipo, owner, contacto_email, contacto_telefone, status, last_sync, uptime_pct_24h, uptime_pct_7d, config_json).
- Endpoint `POST /api/v1/data-sources/{id}/pulse` para receber pulses dos componentes externos.
- `@Scheduled` que marca `DEGRADED` aos 2 min sem pulse e `DOWN` aos 5 min sem pulse.
- Integração com `AlertaService` (alerta crítico quando passa a `DOWN`).
- `pgu-web/src/pages/DataSources.jsx` mais `DataSources.css`: tabela com bolinha por estado, contacto clicável, filtros e ordenação.
- Simulador (`simulator.py`) e NiFi: enviam pulse periódico para a sua data source.

**F5: MFA TOTP**
- `keycloak/pgu-realm-realm.json`: `requiredActions` com `CONFIGURE_TOTP` no admin.
- `keycloak/themes/pgu/login/resources/css/login.css`: estilização dos ecrãs TOTP setup (QR code) e TOTP input.

**F6: i18n**
- `pgu-web/src/i18n/index.js`, `pt.json`, `en.json`.
- `pgu-web/src/main.jsx`: import mais `i18n.init()`.
- `pgu-web/src/components/Layout.jsx`: toggle (bandeira PT/UK) mais persistência em `localStorage`.
- Migração de strings hardcoded das páginas existentes para keys i18n.
- Datas e números via `Intl.DateTimeFormat` e `Intl.NumberFormat` com locale dinâmico.

**F7: Tema escuro**
- `pgu-web/src/index.css`: bloco `[data-theme="dark"]` com palette dark coerente.
- `pgu-web/src/components/Layout.jsx`: toggle sol/lua mais persistência em `localStorage`. Default segue `prefers-color-scheme`.
- Auditoria dos CSS dos componentes para corrigir cores hardcoded (substituir por CSS variables).

**F8: Livemap polish**
- `pgu-web/package.json`: `react-leaflet-cluster`.
- `pgu-web/src/pages/Livemap.jsx`: `<MarkerClusterGroup>` para paragens; `<LayersControl>` com OSM (base), Stamen Terrain (terreno) e Esri World Imagery (satélite).

**F9: Export assíncrono mais email**
- `domain/ExportJob.java`, `db/migration/V31__export_job.sql` (id, user_id, tipo, params, status, created_at, completed_at, minio_key, email_sent_at).
- `service/ExportJobService.java` com `@Async`.
- `controller/ExportsController.java`: modo `async=true` devolve `202 Accepted` mais `jobId`.
- Worker gera CSV ou Excel, faz `StorageService.upload(bucket="exports", key=...)`, atualiza job, gera `presignedUrl(ttl=24h)`, envia email via `JavaMailSender` (Mailpit em dev).
- `pgu-web/src/pages/Exports.jsx`: lista de jobs históricos com status, botão de download mais toast informativo no submit.

#### Status final por fase (entregue)

| Fase | Conteúdo entregue | Notas de deviation |
|---|---|---|
| F0 | **Mailpit + MinIO infra** — containers `mailpit:1025/8025` e `minio:9000/9001`, `MinioConfig` + `StorageService` (upload/download/presigned/delete), `StorageBootstrap` cria buckets `exports`, `attachments`, `avatars` no boot. `application.properties` aponta para Mailpit em dev. | Adicionado `avatars` bucket (não estava no plano, surgiu com a feature de fotos de perfil). |
| F1 | **Routes manifest + lazy** — `src/routes.js` é fonte canónica, `App.jsx` itera com `React.lazy`+`Suspense`, `ProtectedRoute` aceita `requiredRoles` (array), página `/403` (Forbidden.jsx), axios trata 403 com toast. Sidebar gerada pelo manifest. | OK conforme plano. |
| F2 | **Modal a11y** — `role="dialog"`, `aria-modal`, focus trap, replace `window.confirm`. | Plano original era observabilidade (Micrometer + ApiAccessLog + Caffeine). **Adiada para S8b** porque Modal a11y era pré-requisito de várias features. Micrometer ficou só com config base; ApiAccessLog adiado. |
| F3 | **NGSI-LD proxy** — `NgsiLdProxyController` (`/api/v1/ngsi-ld/entities[/{id}]`, `/types`), `NgsiLdService` traduz NGSI v2 → v1.6 com `@context` FIWARE. Jolt do NiFi atualizado para Smart Data Model `Vehicle` oficial. | OK. |
| F4 | **DataSource health** — entidade + V30, probes por tipo (TCP NIFI/MQTT, HTTP Orion, DB GTFS, self-pulse SIMULATOR), pulses cada 30s em `data_source_pulse`, status HEALTHY/DEGRADED/DOWN, broadcast WS `/topic/datasources`, página `DataSources.jsx` com timeline chart (Recharts), modal de report por email, infinite scroll, cache eviction após GTFS import, fallback owner via `GlobalConfig`. | Probe SIMULATOR usava `downThreshold` (saltava DEGRADED). Corrigido para `degradedThreshold`. Migrations V30-V34. |
| F5 | **MFA TOTP no Keycloak** — `otpPolicyType=totp` + `requiredActions.CONFIGURE_TOTP` (`defaultAction: true`) no realm. Theme PGU custom para ecrãs TOTP (QR setup + input) com CSS compacto e listas em grelha. Footer + subtítulo traduzíveis via `${msg("footerText")}` e `${msg("loginSubtitle")}`. Switcher PT/EN no template (canto inferior esquerdo). docker-compose usa `kc.sh import --override true` (sem isto mudanças ao JSON nunca eram aplicadas em DB Postgres). | Descoberto bug crítico: `SecurityConfig` tinha `"operator"` (EN) em 5 regras vs role real `"operador"` (PT). Operadores apanhavam 403 silencioso em `/despacho` e `/ocorrencias`. Corrigido. |
| F6 | **i18n PT/EN** — `react-i18next` + `i18next-browser-languagedetector`, `pt.json`/`en.json` com 300+ chaves cobrindo TODAS as páginas, toasts, modais, audit actions, GTFS progress steps, nomes de DataSources, e o ecrã de Keycloak (`messages_pt.properties`+`messages_en.properties`). `LanguageSwitcher` (pill PT/EN) no Backoffice/Landing/Livemap/Keycloak. `AuthProvider` passa `locale` ao `keycloak.login()` para sincronizar app↔Keycloak. | Cobertura **total** (não parcial como o plano sugeria) — 6 sub-agentes paralelos para finalizar. Audit actions do backend traduzidas via mapping JS no `AuditLogs.jsx`. Mensagens GTFS progress mapeadas por `step` enum (não pelo texto PT). |
| F7 | **Tema escuro** — `[data-theme="dark"]` block em `index.css` (slate-based palette), `ThemeProvider` context com detecção `prefers-color-scheme` + persistência `localStorage`, `ThemeSwitcher` (sol/lua) ao lado do `LanguageSwitcher`. Override em CSS files de cada página + `toast-overrides`. `PainelBordo` ganhou variante light (era hardcoded dark). | Livemap dark **não** troca o tile do Leaflet (decisão UX — mapa light é mais legível). Tema escuro entregue em 100% das páginas. |
| F8 | **Livemap polish** — `leaflet.markercluster` (cluster com `animate:false` para evitar flicker), toggle de layers (paragens/rotas/autocarros), `flyTo` smooth ao clicar bus card, **bus trail** (polyline dos últimos 20 pontos quando bus selecionado), popup `autoClose:false` para não fechar a cada update WS. | Plano original mencionava também base layers (Stamen, satélite) — não implementado, ficou só OSM. |
| F9 | **Exports assíncronos + MinIO** — `ExportService` agora upload para MinIO bucket `exports` com presigned URLs (TTL 60min, regeneradas on-demand). Endpoint `POST /exports/{uuid}/cancel`, status `CANCELED` no enum, `cancellationFlags Map<UUID,AtomicBoolean>` checks por chunk. Filter `owner=me|all|<username>` (admin pode ver outros). UI: botão Cancelar, 6 stat cards (Total/Concluídos/Em fila/Em curso/Falhados/Cancelados), toggle Meus/Todos (admin). Resume após F5 via `GlobalToastListener` que mostra toast loading para jobs RUNNING/PENDING ao montar. Migration V35. | Migração disk → MinIO feita depois do F9 inicial (originalmente eram FileOutputStream → target/exports/). |

#### Follow-ups (entregues além do plano original)

| Bloco | Conteúdo |
|---|---|
| **Self-service de conta** | `GET/PATCH /api/v1/me` + `POST /api/v1/me/password` em `MeController`. `KeycloakAdminService` ganhou `findUserByUsername`, `updateUserSelf`, `validateUserPassword` (OAuth2 password-grant ao client `pgu-backoffice`), `setUserPassword`. `AccountForm` reusável (Perfil + Password com validação 401 currentPassword), página `/backoffice/conta` (admin+operador), modal "Conta" no header do `PainelBordo` (funciona mesmo sem autocarro atribuído), botão "Minha Conta" no `AccountTab` do Livemap. |
| **Foto de perfil (avatar)** | `POST /api/v1/me/avatar` (multipart) + `DELETE` em `MeController`. Bucket `avatars` no MinIO, key `users/<id>-<ts>.<ext>`. Validação 2MB + png/jpg/webp. `avatarKey` guardado como **Keycloak user attribute** (não DB local). DTOs `UserDTO`/`DriverDTO`/`BusDTO` ganham `avatarUrl` (presigned 1h gerado on-the-fly via `AvatarService.enrich`). Componente `Avatar.jsx` reusável (size sm/md/lg/xl, fallback letter com gradient consistente por hash do nome) em Users, Drivers, Buses (driver assigned), Layout sidebar footer, PainelBordo header, AccountTab livemap. |
| **MinIO presigned URL fix** | Após detetar `SignatureDoesNotMatch` ao abrir exports/avatares: a canonical request inclui `Host` header, e o backend assinava com `minio:9000` mas o browser chamava `localhost:9000`. Solução: dois beans em `MinioConfig` — `minioClient` (`@Primary`, interno) para uploads/downloads/stat/remove, e `publicMinioClient` (`@Qualifier("public")`, endpoint `MINIO_PUBLIC_ENDPOINT`) só para gerar presigned URLs. `StorageService.presignedUrl` usa o público. URL assinada já com o host certo, browser autentica sem erro. |
| **Keycloak unmanagedAttributePolicy** | Em Keycloak 24+, atributos não declarados são silenciosamente filtrados no User Profile. PUT a `avatarKey` retornava 204 mas o atributo nunca persistia → avatar desaparecia após refresh. Fix: `@PostConstruct ensureUnmanagedAttributesEnabled()` em `KeycloakAdminService` faz GET `/users/profile`, e se `unmanagedAttributePolicy != ENABLED`, faz PUT a meter `ENABLED`. Idempotent, best-effort (loga warning se Keycloak não disponível). |
| **Admin username imutável** | Self-service de conta: se o user logado é admin, o input `username` em `AccountForm` fica `disabled+readOnly` com hint "O username de admin não pode ser alterado aqui" e `handleSaveProfile` não inclui `username` no payload PATCH. Evita partir referências históricas (audit_log, drivers, exports) e tokens JWT stale. |
| **Drivers.css `.driver-name-cell`** | A coluna "Nome" tinha avatar e nome colados. Adicionada regra `display: flex; align-items: center; gap: 12px; min-width: 0`. Spans/strongs com ellipsis para nomes longos. |
| **PainelBordo timeline percurso** | Linha vertical entre paragens estava desalinhada e descontinuada. Fixes em cascata: (1) `.pb-stop-dot` com `box-sizing: border-box` para o border de 2px contar dentro do width de 12px; (2) linha em `left: 17px` (= padding-left 12 + 6 metade − 1 metade da linha 2px); (3) linha vai de `top: 50%` ao `height: 100%` (centro do dot atual ao centro do próximo, sem gaps); (4) `.pb-stop--current .pb-stop-dot` mantém 12×12 e usa `box-shadow` halo para destaque sem partir alinhamento. |
| **Batch de motoristas** | `POST /api/v1/users/drivers/batch?count=N` (1-50) cria N motoristas aleatórios via Keycloak Admin API com `requiredActions=[UPDATE_PASSWORD]`. `KeycloakAdminService.createUser` passa a aceitar requiredActions no payload. `Drivers.jsx` ganhou modal "Gerar Motoristas em Batch" igual ao de Buses. |
| **Assign UX em Drivers** | Modal de atribuição de autocarro a motorista agora tem search box (filtra `busCode/routeCode/routeName`), grid 2-col, cards com pills coloridos por status, empty state melhorado. `min-width: 0` + `overflow: hidden` para evitar overflow horizontal. |
| **Toast GTFS colapsável** | Após 10s sem hover, toast de progresso GTFS encolhe para círculo 44px com spinner; hover expande de volta. Resume após F5 via `GET /api/v1/gtfs/sync-status`. Mensagens traduzidas por `step` enum (não pelo texto PT). `toast.update` substituído por DOM API direta (`document.getElementById + classList.add`) porque o react-toastify resetava className. `pointer-events: none` no container para deixar clicar nos botões por baixo do toast colapsado. |
| **Polish UI/UX vários** | Ícone próprio para Drivers (`IconDriver`, id-card) e Fontes (`IconDataSource`, database cylinder) para distinguir de Users/GTFS. `IconAccount` para Minha Conta. `.btn-filter` movido de `Buses.css` para `App.css` (global) — antes Users e AuditLogs não tinham filtros estilizados. Lupas SVG uniformes (era emoji unicode em Stops/Routes/Buses). Search placeholders padronizados ("Pesquisar..." / "Search..."). Em dashes removidos (regra do projeto). LanguageSwitcher + ThemeSwitcher no canto inferior direito do Backoffice / esquerdo do Livemap. |
| **Hardening backend** | `evictRouteAndStopCaches()` no `GtfsService` após cada import GTFS (resolve "24 de 80 rotas" causado por cache `routes` stale TTL 10min vs save direto bypass `@CacheEvict`). HikariCP leak threshold elevado a 180s + `flush()` em batches de 100. `@Lazy GtfsService self` para resolver `@Async` self-call que bypassava o proxy AOP. |

#### Deviations ao plano original

1. **Observabilidade adiada para S8b.** Plano F2 era Micrometer Prometheus + `api_access_log` + Caffeine. Substituído por Modal a11y + outras quick wins. Micrometer entrou com config base mas sem ApiAccessLog. Justificação: várias features no F4-F9 dependiam de Modal a11y; Prometheus não tinha consumidor configurado ainda.

2. **MinIO promovido a Sprint 0 fase 0.** Plano original (linha 363) tinha como "evolução futura". Promovido porque F9 depende dele e fotos de perfil + futuros attachments precisam.

3. **Self-service de conta + fotos de perfil + batch drivers + assign UX.** Não estavam no plano. Adicionados por iteração com o utilizador. Reforçam a perceção de "produto profissional".

4. **i18n cobertura total.** Plano sugeria migrar páginas existentes para keys. Implementação cobriu 100% das páginas (Dashboard, Buses, Routes, Stops, Drivers, Users, Ocorrências, Exports, GtfsManager, GlobalConfig, AuditLogs, DataSources, AnalyticsDashboard, BusHealthDashboard, Livemap, PainelBordo, Landing, Layout, Modal, GlobalToastListener) + Keycloak templates + audit actions do backend.

5. **Tile Leaflet light fixo.** Plano F7 implicava tema escuro também no mapa. Decisão UX: tile light é mais legível para operação real; só os painéis UI à volta do mapa mudam.

6. **F9 reescrito.** Plano era "email com link MinIO" como notificação. Implementação foca em UI (cancel + stats + filter) + WS resume. Email não foi conectado (Mailpit captura mas notificação por email ficou para S8a junto com Metabase Pulses).

7. **Self-service no Painel de Bordo.** Motorista pode editar a sua conta no painel mesmo SEM autocarro atribuído (caso edge — pediu explicitamente).

#### Saída do Sprint 0

- ✅ Enforcement de roles por página (não só por endpoint) + página `/403`.
- ✅ NGSI-LD oficial exposto para validar conformidade FIWARE.
- ✅ DataSources monitorizadas com timeline chart, probes por tipo, alarmística e fallback owner.
- ✅ MFA TOTP obrigatório no Keycloak, com tema PT/EN próprio.
- ✅ App **totalmente** bilingue PT/EN (frontend + Keycloak + audit actions + GTFS steps + nomes de DataSources).
- ✅ Tema escuro em 100% das páginas (Backoffice + Livemap + PainelBordo + Keycloak templates), com toggle persistente e detecção `prefers-color-scheme`.
- ✅ LiveMap polido (cluster, toggles, flyTo, bus trail).
- ✅ Exports em MinIO com presigned URLs, cancel, resume e filter por user. Toast colapsável que não ocupa espaço durante syncs longos.
- ✅ Self-service de conta (admin/operador via /backoffice/conta, motorista via modal no PainelBordo) com upload de avatar.
- ✅ Avatares aparecem em Users, Drivers, Buses (driver assigned), Layout sidebar e PainelBordo header.
- ✅ Batch de motoristas (semelhante a buses) para popular o ambiente rapidamente.
- ✅ Modal de assign bus → driver com search e grid limpo.
- ✅ Várias correcções de hardening backend (cache eviction, leak detection, async proxy).
- ✅ Mailpit em dev / SMTP gmail em prod (já configurável).

---

### Sprint 1 — Vertical 3.1 Completo (Transportes Públicos)

**Duração estimada:** 2 semanas (~41h).

**Requisitos 3.x cobertos:** R.IVT.01–11 (100%).

**Requisitos 2.x dependentes:**
- R.INT.10 — disponibilizar em formato compatível com dados.gov.pt.
- R.AN.04 — exportação Excel (Apache POI).
- R.BO.01 — export GeoJSON.

#### Estrutura por fases (10 fases, 1 commit cada)

Sequência por dependências (F0 base, F9 wrap-up) e por importância dentro de cada nível. Ordem: features sem deps → features dependentes de F0 → integrações complexas → cross-cutting final.

| # | Fase | Esforço | Depende de | R.cobertos |
|---|---|---|---|---|
| F0 | **Entidade `Operator` + relação `Route.operator`** | ~2h | nenhuma | R.IVT.03 |
| F1 | **Export GeoJSON** de rotas e paragens | ~2h | nenhuma | R.BO.01 |
| F2 | **Schedule adherence stoplight** no Livemap (verde/amarelo/vermelho por linha) | ~2h | telemetria existente | extensão R.IVT.06 |
| F3 | **API Catálogo Nacional (DCAT-AP)** — `GET /api/v1/catalog/datasets` | ~3h | F0 | R.IVT.09, R.INT.10 |
| F4 | **Calendário operacional** — `Calendar.jsx` semanal/diária | ~6h | F0 (operadores no header) | R.IVT.05 |
| F5 | **Indicadores cobertura/frequência** — endpoint + secção `AnalyticsDashboard` | ~6h | GTFS interno | R.IVT.06 |
| F6 | **Cruzamento dados mobilidade real** — atrasos + correlação com eventos | ~2h | telemetria + GTFS | R.IVT.10 |
| F7 | **GTFS-RT Publisher** — protobuf `vehicle-positions.pb` + `trip-updates.pb` | ~8h | F0, GTFS interno, telemetria | R.IVT.01, R.IVT.04, R.IVT.07 |
| F8 | **NeTEx Exporter** — `GET /api/v1/netex/export.xml` (subset essencial) | ~8h | F0, F4 | R.IVT.02, R.IVT.08, R.IVT.11 |
| F9 | **Cross-cutting** — pulses DataSource + métricas Micrometer | ~2h | F7 | observabilidade |

**Esforço total:** ~41h.

#### Entregáveis por fase

**F0: Entidade `Operator`**
- Migração `V37__operator.sql` (id, code, name, taxId, country, contact_email).
- `domain/Operator.java` + `repository/OperatorRepository.java`.
- `Route.operator` (FK `route.operator_id`).
- `OperatorController` (CRUD admin) + `OperatorDTO`.
- Seed: 1 operador "TUB - Transportes Urbanos de Braga" no realm/import inicial.
- Frontend `routes.js`: nova entry `/backoffice/operators` (admin), com Icon novo `IconOperator` (building/company).
- Em todas as listagens de Routes (backoffice + livemap), passar a mostrar `operator.name` ao lado do código.

**F1: Export GeoJSON**
- `RouteController` → `GET /api/v1/routes/export.geojson` retorna `FeatureCollection` com `LineString` por rota (geometria via `route_segments`).
- `BusStopController` → `GET /api/v1/stops/export.geojson` retorna `FeatureCollection` com `Point` por paragem.
- Propriedades: `code`, `name`, `routeIds` (stops), `operatorCode` (routes).
- Headers: `Content-Type: application/geo+json`, `Content-Disposition: attachment; filename=...`.
- Sem autenticação extra — fica em `permitAll()` para integração com QGIS, dados.gov.pt.
- Botões "Export GeoJSON" em Routes.jsx e Stops.jsx (admin).

**F2: Schedule adherence stoplight**
- Pequena extensão de `/api/v1/analytics/route-delays` (já existe) com agregação por linha + classificação:
   - 🟢 verde: `avgDelayMin < 2`
   - 🟡 amarelo: `2 ≤ avgDelayMin < 5`
   - 🔴 vermelho: `avgDelayMin ≥ 5`
- Frontend `Livemap.jsx` (sidebar Routes tab): pill colorido ao lado de cada rota com o avgDelay; click expande detalhes.
- Toggle "Adherence layer" nos overlay-controls que pinta cada polyline da rota com a cor stoplight.

**F3: API Catálogo Nacional (DCAT-AP)**
- `CatalogController` → `GET /api/v1/catalog/datasets` retorna JSON-LD DCAT-AP v2.1 com:
   - Dataset GTFS (gerado pelo GtfsService)
   - Dataset GTFS-RT (apontando para F7 quando disponível)
   - Dataset GeoJSON-rotas (F1)
   - Dataset GeoJSON-paragens (F1)
- Cada dataset: `dct:identifier`, `dcat:landingPage`, `dcat:distribution[]`, `dcat:contactPoint` (operador do F0).
- Mete-se em `permitAll()` para o catálogo nacional indexar.
- Validador online: <https://www.itb.ec.europa.eu/shacl/dcat-ap/upload>.

**F4: Calendário operacional**
- `pgu-web/src/pages/Calendar.jsx` + `.css`. Sidebar entry "Calendário" na section Operações.
- Vista semanal (default) + vista diária. `<input type="week">` ou similar nativo.
- Carrega `service_calendar` (já existe na BD via GTFS V20-V24): mostra que rotas estão ativas em cada dia (segunda-sexta, sábado, domingo, feriados).
- Endpoint `GET /api/v1/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` retorna `[{date, routeIds[], routeNames[], totalTrips}]`.
- Heatmap: dias com mais viagens em cor mais forte.
- Click num dia → modal com lista das rotas e contagem de viagens.

**F5: Indicadores cobertura/frequência**
- `AnalyticsController` → `GET /api/v1/analytics/coverage` retorna 3 indicadores:
   - `geographicCoveragePct`: percentagem da área de Braga a 5-min walking (~400m) de uma paragem. Query PostGIS com `ST_DWithin` + `ST_Union` num polygon de Braga.
   - `averageFrequencyByRouteHour[]`: matriz rota × hora-do-dia com `avgHeadwayMinutes`.
   - `averageWaitTimeByStop[]`: `wait = headway / 2` por paragem, ordenado.
- Frontend: nova secção em `AnalyticsDashboard.jsx`:
   - KPI card "Cobertura geográfica" (% + barra).
   - Heatmap rota × hora (Recharts).
   - Top 10 paragens com pior tempo de espera + top 10 melhor.

**F6: Cruzamento dados mobilidade real**
- Extensão de `route-delays` (já existe) para correlacionar com eventos no `ServiceAlert` (que vai ser criado em S7 — para já placeholder).
- Endpoint `GET /api/v1/analytics/route-delays/correlations?routeId=...` retorna lista de eventos próximos no tempo + descrição.
- No `Livemap.jsx` (Routes tab), quando user clica num atraso → modal mostra eventos correlacionados.

**F7: GTFS-RT Publisher**
- `pgu/pom.xml`: dependência `com.google.transit:gtfs-realtime-bindings:0.0.6`.
- `controller/GtfsRtController.java`:
   - `GET /api/v1/gtfs-rt/vehicle-positions.pb` — converte `vehicle_telemetry` recente (últimos 5 min, agregado por busId) em `FeedMessage` com `VehiclePosition[]`. `Content-Type: application/x-protobuf`.
   - `GET /api/v1/gtfs-rt/trip-updates.pb` — junta GTFS schedule + telemetria → `TripUpdate[]` com `arrivalTime` previsto vs `scheduledTime`. Calcula `delay`.
   - Cache 30s via `@Cacheable("gtfs-rt-vp")` / `("gtfs-rt-tu")`.
- `permitAll()` para integração com Google Maps, Citymapper, transit apps.
- Validador: <https://github.com/MobilityData/gtfs-realtime-validator>.

**F8: NeTEx Exporter**
- `pgu/pom.xml`: dependência `org.entur:netex-xsd` (XSD oficial) — ou geração manual com JAXB.
- `controller/NeTExController.java`:
   - `GET /api/v1/netex/export.xml` retorna NeTEx 1.2 PublicationDelivery.
- `service/NeTExExportService.java` serializa subset essencial:
   - `<ResourceFrame>` — Operadores (F0).
   - `<SiteFrame>` — Paragens com coordenadas + Quays.
   - `<ServiceFrame>` — Lines + Routes + StopPointInJourneyPattern.
   - `<TimetableFrame>` — ServiceJourneys + DayTypeAssignments (depende F4 Calendar).
- Validador: <https://enturas.atlassian.net/wiki/spaces/PUBLIC/pages/637370392/Validators>.

**F9: Cross-cutting (pulses + métricas)**
- `DataSourceHealthService` ganha 2 novos pulses:
   - "GTFS-RT publisher" — pulse a cada `/gtfs-rt/*.pb` request bem-sucedido.
   - "NeTEx exporter" — pulse a cada export bem-sucedido.
- Micrometer:
   - `Timer("gtfs_rt.generation.duration")` (com tag `feed=vehicle-positions|trip-updates`).
   - `Counter("gtfs_rt.requests")` (tag feed).
   - `Timer("netex.export.duration")`.
   - `Counter("gtfs.import.success")` / `Counter("gtfs.import.failed")` (retroactivo no GtfsService).
- Adicionar entry na página DataSources para que admin veja as novas fontes.

#### Riscos

- **NeTEx é XML schema complexo.** Subset essencial é viável em ~8h; full NeTEx requer +10h. Se houver pressão de tempo, F8 pode entregar apenas `<ResourceFrame>` + `<SiteFrame>` + `<ServiceFrame>` e adiar `<TimetableFrame>` para Sprint 8b.
- **GTFS-RT cache 30s.** Em demo com pouca telemetria, cache pode dar a impressão de "feed parado". Mitigar com `Cache-Control: max-age=30, must-revalidate` explícito.
- **Cobertura geográfica em F5** assume polygon de Braga. Se não existir, usar `ST_ConvexHull` de todas as paragens (aproximação).
- **DCAT-AP** validação SHACL pode falhar em campos opcionais — testar cedo no validador oficial.

#### Saída do Sprint 1

- ✅ Conformidade FIWARE GTFS-RT (standard real-time de facto da indústria).
- ✅ Conformidade NeTEx (compliance europeu para autoridades de transporte).
- ✅ DCAT-AP exposto para indexação pelo catálogo nacional dados.gov.pt.
- ✅ Operadores como entidade de primeira classe (preparação para futuras multi-operator scenarios).
- ✅ Indicadores R.IVT.06 (cobertura geográfica, frequência por linha/hora, tempo de espera).
- ✅ Calendário operacional para vista de planeamento semanal/diária.
- ✅ Schedule adherence stoplight visualmente no Livemap.
- ✅ GeoJSON exportável para QGIS, dados.gov.pt e outras ferramentas SIG.
- ✅ Métricas e pulses para os novos publishers — observabilidade preparada para S8a.

---

### Sprint 2 — Vertical 3.4 + Fundação Bilhética + Particionamento

**Duração:** 1.5-2 semanas (~30h).

**Requisitos 3.x cobertos:** R.ICP.01–10 (100%).

**Requisitos 2.x dependentes:**
- R.INT.01 — Smart Data Model `PassengerCount`.

**Entregáveis:**

**Refactor da telemetria** (R.ICP.01)
- Migração V27: alterar `vehicle_telemetry` para incluir `boarded INT`, `alighted INT`, `onboard INT` (passengerCount mantém-se por backward compat até deprecate).
- NiFi Jolt atualizado.
- Simulador atualizado para gerar boarded/alighted realistas.
- AlertaService atualizado para usar `onboard` em vez de `passengerCount`.
- Esforço: 4h.

**Particionamento `vehicle_telemetry`** `[movido de S4 — ordering O1]`
- Migração V28: `PARTITION BY RANGE (DATE_TRUNC('month', recorded_at))`.
- Política de retenção: manter 90 dias quentes, arquivar restante (script cron).
- Inclui migração de dados existentes (Flyway script `pg_partman` ou manual).
- Esforço: 4h.

**Inventário de sensores** (R.ICP.07)
- Entidade `PassengerSensor` (id, gateway, busId, doorPosition, status, lastReading, location).
- `SensorController` + página `Sensors.jsx` no backoffice.
- Esforço: 5h.

**Thresholds ocupação** (R.ICP.05)
- Adicionar `OcupacaoThresholdRule` em `GlobalConfig` (warning_pct=80, critical_pct=95, no_data_minutes=10).
- Integrar com `AlertaService`.
- Esforço: 3h.

**Dashboard ocupação por linha/hora** (R.ICP.04)
- `OccupancyDashboard.jsx` baseado em analytics views.
- Esforço: 4h.

**Fundação bilhética** (preparação Sprint 5)
- Migração V29: tabela `ticket_validation` criada (vazia) — schema em §5.1.
- Migração V30: tabela `ticket_type` (catálogo).
- Endpoint stub `/api/v1/validations` que aceita ingestão mas só loga (sem dashboards).
- Esforço: 3h.

**Smart Data Model `PassengerCount`** (R.ICP.10)
- Jolt no NiFi + endpoint NGSI-LD via proxy de Sprint 0.
- Esforço: 2h.

**Adições da auditoria:**
- **Activity feed unificado** (BRT-style) — eventos recentes (alarms, route changes, ocorrências, validações). 4h.
- **Paginação geral** — `Pageable` em todos os endpoints de listagem (Telemetry, Ocorrencias, Bus, Routes, GTFS imports). `[BE-5]`. 1.5h.

**Cross-cutting:**
- Publish pulse em `DataSourceHealthService` para "Passenger sensors" e "Telemetry ingest". 0.5h.
- Métricas: `Counter("passenger.boarded/alighted")`, `Gauge("occupancy.percent")`. 1h.

**Esforço total Sprint 2:** ~32h.

---

### Sprint 3 — Vertical 3.5 (Painéis DMS)

**Duração:** 1 semana (~22h). **Paralelizável com S2 ou S4 se 2 devs.**

**Requisitos 3.x cobertos:** R.IPM.01–10 (100%).

**Requisitos 2.x dependentes:** R.INT.01 (`DisplayDevice`, `InformationPanel`, `Message`).

**Entregáveis:**
- Entidade `DisplayPanel` (id, code, type ENUM[EPAPER,LED,TFT,ONBOARD], stop_id FK, bus_id FK, location, status ENUM[ONLINE,OFFLINE,FAULTY,LOW_BATTERY], lastHeartbeat, batteryPct, temperature, currentMessage). Migração V31.
- Tabela `display_panel_event` para histórico.
- `DisplayPanelController` com CRUD + `POST /heartbeat` + `POST /content`.
- Simulador estende para 5-10 painéis com heartbeat MQTT cada 30s.
- Página `DisplayPanels.jsx` com tabela + filtros.
- Camada "Painéis" no Livemap com ícones diferenciados por tipo, cores por estado.
- Dashboard DMS no AnalyticsDashboard.
- Alertas integrados (`AlertaService` reage a OFFLINE > 5 min, LOW_BATTERY < 15%).
- Smart Data Models `DisplayDevice` / `InformationPanel` no NiFi e endpoints REST.

**Adições da auditoria:**
- **Bookmarks/favoritos** (BRT-style — movido de S7 para equilibrar carga). 2.5h.

**Cross-cutting:**
- Pulse `DataSourceHealthService` para "DMS heartbeat". 0.25h.

**Esforço total Sprint 3:** ~25h.

---

### Sprint 4 — Vertical 3.2 (Material Circulante / OBD/CAN)

**Duração:** 2 semanas (~38h).

**Requisitos 3.x cobertos:** R.IMC.01–09.

**Requisitos 2.x dependentes:** R.INT.01 (`Vehicle`, `VehicleDiagnostic`).

**Pré-requisitos garantidos:** Particionamento `vehicle_telemetry` já feito em S2.

**Entregáveis:**
- **Estender simulador** com geração CAN/OBD: RPM motor, temperatura motor, nível combustível/SoC bateria, pressão pneus, voltagem 12V, contadores km e horas, DTCs ocasionais. 6h.
- **Migração V32** — tabela `vehicle_diagnostic` (já particionada por mês, seguindo pattern de S2) (id, bus_id, timestamp, engineRpm, engineTempC, fuelLevelPct, batterySocPct, batteryVoltage, tirePressureKPa[4], odometerKm, engineHours, dtcCodes[], rawCanFrame JSONB). 2h.
- **`VehicleDiagnosticController`** — `POST /ingest` (do NiFi), `GET ?busId&from&to`, `GET /latest?busId`. 3h.
- **NiFi pipeline adicional** — consume tópico MQTT `tub/diagnostic`, ingere; envia para Orion como `VehicleDiagnostic` NGSI-LD. 4h.
- **Página `FleetHealth.jsx`** — dashboard técnico (tabela de viaturas, drill-down com gráficos, DTCs ativos, MTBF/MTTR estimado). 8h.
- **Eventos técnicos** (R.IMC.05) — pipeline NiFi gera `Ocorrencia` automática quando deteta DTC crítico (temp > 95°C, bateria < 20%). 3h.
- **Integração com manutenção** (R.IMC.08) — campo `acaoPreventiva` em `Ocorrencia`. 1h.
- Smart Data Model `Vehicle` com sub-propriedade `vehicleDiagnostic`. 2h.

**Adições da auditoria:**
- **`@Transactional` audit + REQUIRES_NEW em ExportService** `[BE-11]`. 1.5h.
- **`Route.routeStops` LAZY + @EntityGraph** `[BE-4]`. 1.5h. **Cuidado: verificar serialização Route em todos os endpoints existentes para não quebrar JSON.**

**Cross-cutting:**
- Pulse `DataSourceHealthService` para "OBD/CAN telemetry". 0.25h.
- Métricas: `Timer("diagnostic.ingest.duration")`, `Counter("dtc.detected")` por tipo. 1h.

**Esforço total Sprint 4:** ~33h.

---

### Sprint 5 — Vertical 3.3 (Bilhética Trí-Modal)

**Duração:** 2 semanas (~52h). **Aumento vs estimativa original (~34h) por adição da componente papel/ETM + reconciliação + fraude base.**

**Requisitos 3.x cobertos:** R.IPB.01–10.

**Requisitos 2.x dependentes:**
- R.SEC.04 — RGPD anonimização.
- R.INT.01 — Smart Data Model `Ticket` / `TransitTrip`.

**Pré-requisitos garantidos:** Tabela `ticket_validation` criada em S2 (vazia, sem coluna paper). Esta sprint **estende** a tabela com colunas para mobile e papel + cria `paper_ticket_reconciliation`.

**Pré-requisito operacional:** **CONFIGURAR `PGU_TICKET_SALT` em env vars antes de qualquer ingestão.** Se simulador correr em dev sem salt, hashes ficam diferentes entre ambientes e validações aparecem como duplicadas.

#### Entregáveis core (todos os três modos)

- **Migração V36** — estender `ticket_validation` com colunas mobile (`qr_token`) + papel (`paper_serial`, `etm_id`, `driver_id`, `payment_method`, `amount_cents`) + constraint `chk_source_fields`. Esquema completo em §5.1. 2h.
- **Migração V37** — criar `paper_ticket_reconciliation` com índices. 1h.
- **`TicketValidationController`**:
  - `POST /api/v1/validations` (universal — aceita os três sources via campo `source`). Valida via constraint do schema. X-API-Key obrigatório. 4h.
  - `GET /api/v1/validations` (filtros: source, route, from, to). Paginado. Requer admin/operador. 1.5h.
  - `GET /api/v1/validations/stats?route_id&from&to&source` (agregados anonimizados, sem `card_pseudo_id`). 2h.
- **`PaperTicketReconciliationController`**:
  - `POST /api/v1/reconciliations` (recebe Z-report do ETM via NiFi). 2h.
  - `GET /api/v1/reconciliations?status&driver` (lista, com filtros). 1.5h.
  - `PATCH /api/v1/reconciliations/{id}` (supervisor introduz `reported_revenue_cents`, status). 1h.
  - `POST /api/v1/reconciliations/{id}/investigate` (escala para FRAUD_INVESTIGATION com notes). 0.5h.
- **`PaperTicketFraudDetector` (jobs/scheduled)** — corre quando reconciliação é submetida ou via cron diário. **Implementa regras 1, 2 e 3 do §5.1** (sequence gap, cash discrepancy, duplicate serial cross-shift). Regras 4-6 ficam para S7. Popula `fraud_flags`, dispara alertas para supervisor via `AlertaService`. 5h.
- **Pseudonimização** — cartões usam `SHA-256(cardReal + salt)`; sem armazenamento de nome/email. `PGU_TICKET_SALT` carregado de env, falha boot se ausente. 2h.

#### Simulador estendido

Geração realista das três fontes com perfis temporais e espaciais:
- **CARD (~70%)**: PASSE_MENSAL alto em horas de ponta laborais, PASSE_SENIOR em meio-dia, PASSE_ESTUDANTE em horas escolares.
- **MOBILE_QR (~15-20%)**: maior peso em fins-de-semana, eventos, zonas universitárias.
- **ONBOARD_PAPER (~10-15%)**: maior peso em paragens turísticas (centro Braga, Bom Jesus, hospital), domingos, períodos sem cartão TUB.
- **Reconciliação simulada**: a cada turno (8h), simulador emite Z-report. **5% dos turnos têm fraude injetada** (sequence gap aleatório ou cash discrepancy) para testar `PaperTicketFraudDetector`.
- Esforço: 7h.

#### Dashboards e Analytics

- **`TicketingDashboard.jsx`**:
  - Validações por hora/linha/tipo de título (R.IPB.03). 2h.
  - **Distribuição por fonte** (CARD vs MOBILE_QR vs ONBOARD_PAPER) — gráfico de barras stacked + tabela. 2h.
  - Matriz origem-destino agregada (R.IPB.05) — apenas para CARD (papel sem identidade). 2h.
  - Alertas de validações inválidas/duplicadas (R.IPB.06). 1h.
  - Heatmap geográfico de utilização por paragem **com filtro por fonte**. 2h.
- **`ReconciliationDashboard.jsx`** (admin/operador):
  - Lista de reconciliações pendentes ordenada por shift_end. 2h.
  - Drill-down por motorista: histórico, taxa de discrepância, fraud_flags acumulados. 2h.
  - Workflow de revisão (introduzir reported_revenue, marcar reconciled/disputed). 2h.
  - **Top 10 motoristas por discrepância** mensal. 1h.
  - **Taxa de skipped serials por ETM** (manutenção vs fraude). 1h.

#### Cruzamentos exigidos pelo caderno

- **R.IPB.04 Correlação com GTFS/SAE** — endpoint `/api/v1/analytics/demanda-vs-oferta` que cruza validações totais (todas fontes) com `vehicle_telemetry` + horários GTFS. 3h.
- **Cross-validation com APC sensors** (fundação para regra 4 de fraude em S7): endpoint stub `/api/v1/reconciliations/{id}/cross-check` que mostra "boarded count" vs "tickets sold + passes validated" para o turno. Em S5 é só display; em S7 alimenta o detector automático. 2h.

#### DPIA (R.SEC.04 + entregável 4.6 do caderno)

Documento `docs/dpia-bilhetica.md` cobrindo:
- **Dados pessoais tratados:** apenas `card_pseudo_id` (CARD source). MOBILE_QR usa token descartável; ONBOARD_PAPER **não tem qualquer dado pessoal**.
- **Finalidade:** análise operacional de procura, deteção de fraude operacional.
- **Base legal:** interesse legítimo do operador de transportes (Art. 6.º(1)(f) RGPD).
- **Retenção:** 5 anos para validações agregadas; 3 meses para `raw_payload` JSON; 7 anos para `paper_ticket_reconciliation` (obrigação contabilística).
- **Direitos do titular:** exercidos via emissor de cartões TUB (mapping cardReal↔cardPseudoId é externo à PGU).
- **Risk assessment:** matriz de riscos (reidentificação se salt comprometido, leak de raw_payload, etc.) e mitigações.
- Esforço: 4h.

#### Adições da auditoria (já planeadas)

- **`OcorrenciaService.listarOcorrencias`: query parametrizada** `[BE-2]`. 1.5h.
- **`ExportService` streaming** `[BE-3]`. 2h. Usar Spring Batch ou `Stream<>` com `fetch-size`.
- **`BusService.stream().max()`: substituir por Sequence PostgreSQL** `[CONFIRMED-COM-AJUSTE]` `[BE-13]`. 1.5h. Sequence thread-safe.
- **`GtfsService.findAll`: usar `findByRouteId`** `[BE-14]`. 0.5h.

#### Cross-cutting

- Pulse `DataSourceHealthService` para "Card validator", "Mobile QR scanner", "ETM onboard" (3 fontes distintas). 0.75h.
- Métricas Micrometer: `Counter("ticket.validation.{source}.{result}")`, `Counter("paper.fraud.flag.{rule}")`, `Gauge("reconciliation.pending.count")`. 0.5h.

**Esforço total Sprint 5:** ~52h (2 sem apertadas para 1 dev; viável se 6h/dia + algum overflow para S6 que é leve).

---

### Sprint 6 — Vertical 3.6 (Carregadores Elétricos)

**Duração:** 1.5 semanas (~26h). **Paralelizável com S5 se 2 devs.**

**Requisitos 3.x cobertos:** R.ICE.01–14.

**Requisitos 2.x dependentes:** R.INT.01 (`EVChargingStation`).

**Entregáveis:**
- **Migração V33** — tabela `charging_station` (id, code, operator ENUM[TUB_FLEET_1..3, MOBI_E], location, status, connectors JSONB, maxPowerKw, ownerId). 1.5h.
- **Migração V34** — tabela `charging_session` (id, station_id FK, bus_id FK nullable, vehicle_external_id, started_at, ended_at, energyKwh, peakPowerKw, cost, paymentMethod, status). 1.5h.
- **Controllers** + simulador (3 estações Mobi.E + 5 da frota com sessões realistas: noite > dia). 6h.
- **Página `ChargingStations.jsx`** — mapa + tabela + filtros por operador/tipo/estado. 5h.
- **Dashboard `ChargingDashboard.jsx`** — kWh por dia/operador, utilização %, sessões médias, custo estimado. 4h.
- **Alertas** (R.ICE.07) — sem heartbeat > 30 min, sessão > 4h, consumo anómalo. 2h.
- **Modelo Smart Data Model `EVChargingStation`** (https://github.com/smart-data-models/dataModel.Transportation). 1.5h.
- **API NGSI-LD específica** (R.ICE.10) — `GET /api/v1/ngsi-ld/entities?type=EVChargingStation`. 1h.

**Cross-cutting:**
- Pulse `DataSourceHealthService` para cada plataforma de carregador (4 fontes). 0.5h.
- Métricas: `Counter("charging.session.started/ended")`, `Histogram("charging.energy.kwh")`. 0.5h.

---

### Sprint 7 — IA on-premises + Features BRT-style Core

**Duração:** 2 semanas (~50h). **Reduzido vs original — features de polish movidas para S8b.**

**Requisitos 2.x cobertos:**
- R.IA.01–07 — IA completa.
- R.AN.10 — análises comparativas.
- R.AN.19 — análises preditivas (mínimo).
- R.AN.11 — painéis customizáveis (via Metabase).

#### IA (núcleo, ver §5.2)
- Container Ollama no docker-compose (rede `ai_net` sem internet) com `llama3.1:8b` (~5GB RAM). 3h.
- `AiChatController` (`POST /api/v1/ai/chat`). 2h.
- `AiToolRouter` com ~10 tools read-only. 8h.
- Página `Chatbot.jsx` no backoffice com histórico + disclaimer + indicador "Llama 3.1 on-premises". 6h.
- Tabela `ai_interaction_log` (V35). 1h.
- Página `AiMonitoring.jsx` (admin only) — métricas de uso, latência, tools mais chamados (R.IA.04). 4h.
- Script de evals em `pgu/src/test/.../AiEvalTest.java` com 20 prompts de referência (R.IA.06). 4h.

#### Features BRT-style core
- **Headway monitoring** + bunching detection. Página `Headway.jsx`. 6h.
- **Dwell time analytics** — tempo médio em cada stop, detecção de paragens problemáticas. 4h.
- **Service alerts** — entidade `ServiceAlert` (interrupções planeadas/imprevistas, afeta rotas X/Y, mostra no Livemap e painel da paragem). Cobre R.IPM.06 também. 5h.
- **Forecasting simples** — previsão de procura por linha/hora 24h via ARIMA (lib `org.apache.commons.math3`). Endpoint `/api/v1/analytics/forecast` + secção AnalyticsDashboard. 6h.

#### Deteção avançada de fraude bilhética (regras 4, 5, 6 — extensão do S5)

Implementação das regras de fraude que dependem de dados cruzados de outros verticais (já existentes após S2, S4, S5).

- **Regra 4 — Undersell vs APC sensor** (depende de S2 `PassengerSensor`): job `CrossSensorFraudCheck` que, por turno, agrega `boarded_count` de `vehicle_telemetry` (já com `{boarded, alighted, onboard}` desde S2) e compara com `(papel_tickets_sold + passes_validated)` da mesma janela temporal. Desvio > 20% e > 5 passageiros = `fraud_flag='UNDERSELL_VS_COUNTER'`. **Output**: relatório no `ReconciliationDashboard` mostrando bus_id, motorista, turno, contagens lado-a-lado. 4h.
- **Regra 5 — Driver pattern anomaly**: cálculo estatístico mensal. Para cada motorista: histograma de "bilhetes papel por 100 passageiros boarded" normalizado por linha+hora_dia. Detecta outliers (z-score > 2). Job mensal `DriverPatternAnomalyDetector`. **Output**: lista de motoristas a investigar em `ReconciliationDashboard`. 3h.
- **Regra 6 — GPS-time mismatch**: job que correlaciona timestamp e local declarado de cada `ticket_validation` com `vehicle_telemetry` mais próximo (±60s). Se distância > 500m = flag. Útil também para dessincronização de ETM (manutenção). 2h.

Estas regras integram-se no `PaperTicketFraudDetector` existente (S5) que passa a ter 6 regras em vez de 3.

#### IA aplicada à fraude (opcional, se houver tempo)

- **Tool extra para o chatbot**: `getReconciliationsAtRisk(driver_id?, window)` que devolve agregados de discrepâncias e flags. Permite operador perguntar em linguagem natural "que motoristas tiveram mais discrepâncias este mês?". 1h.
- **Anomaly detection com Isolation Forest** (extensão futura, não obrigatório) — usar lib `smile` Java para deteção não-supervisionada de padrões de fraude novos. Documentado como roadmap. 0h (apenas decisão arquitetural documentada).

**Cross-cutting:**
- Métricas IA: `Counter("ai.query.success/failed")`, `Timer("ai.query.latency")`, `Counter("ai.tool.{name}.invocations")`. 1h.

**Esforço total Sprint 7:** ~50h.

**Removido daqui (movido para S8b):** replay temporal, Cmd+K search, onboarding tour, keyboard shortcuts modal. (Razão: equilíbrio de carga — ver Anexo F §F.5.)

---

### Sprint 8a — Conformidade Core

**Duração:** 1.5 semanas (~30h).

**Requisitos 2.x cobertos:**
- R.BAC.01–09 — Backups.
- R.CLOUD.05 — Monitorização.
- R.SEC.04, R.SEC.08 — RGPD + NIS2 documentação.
- R.AN.16 — Agendamento de relatórios Metabase.
- R.AN.17 — SSO Metabase ↔ Keycloak.

**Entregáveis:**
- **Backups automatizados** — script `pg_backup.sh` agendado via container `offen/docker-volume-backup`. Retenção 7d diário / 6m mensal / 1a anual. Armazenado em Azure Blob com versionamento (WORM via lifecycle policy). Script de restore documentado e testado. **Inclui Keycloak DB, MongoDB (Orion), NiFi flow config** (não apenas DW). 6h.
- **WAL archiving em PostgreSQL** para point-in-time recovery. `wal_level=replica`, `archive_command`. 2h.
- **Monitorização Prometheus + Grafana** — adicionar ao docker-compose. Hooks de S0 já existem; aqui apenas scrape config + dashboards. Dashboards: latência API, RAM/CPU containers, throughput MQTT, depth de filas, erros 5xx, ingestão GTFS, estado Orion, IA queries. 6h.
- **Liveness/readiness probes** (`management.endpoint.health.probes.enabled`). 1h.
- **DPIA completo** em `docs/dpia.md` (cobre 4.6 do caderno). 3h.
- **Plano NIS2** em `docs/conformidade-nis2.md` (cobre 4.7) — matriz de riscos, plano CSIRT, testes de penetração agendados. 3h.
- **Plano de Backups** em `docs/plano-backups.md` (cobre 4.4) com RTO <1h, RPO <15min, runbook de restore + teste mensal. 1.5h.
- **Manual Técnico** atualizado em `docs/manual-tecnico.md` (4.1). 3h.
- **Documentação Smart Data Models** em `docs/smart-data-models.md` (4.2). 2h.
- **Metabase OIDC SSO** com Keycloak. 1.5h.
- **Metabase Pulses** — agendar 2-3 relatórios (KPI semanal por linha, sessões carregamento diárias) por email. 1h.

---

### Sprint 8b — Qualidade & Polish

**Duração:** 1.5 semanas (~28h).

**Objetivo:** testes automatizados, CI/CD, observabilidade avançada, features de UX adiadas, error tracking.

**Entregáveis:**
- **Testes Testcontainers** para repos + MockMvc para controllers críticos. Cobertura alvo 60%. 12h (esforço inicial; manutenção contínua).
- **CI/CD GitHub Actions** — build maven + npm + tests + lint + docker build. 4h.
- **`logback-spring.xml` JSON logging** (Logstash encoder). 2h.
- **Distributed tracing** — `micrometer-tracing-bridge-brave` + Zipkin/Tempo no docker-compose. 2h.
- **Sentry frontend** + source maps (self-hosted recomendado para plataforma fechada). 3h.
- **Sentry backend** com Spring Boot integration. 1.5h.
- **`dependabot.yml`** para maven, npm, docker. 0.5h.
- **Documentação APIs** — gerar OpenAPI YAML estático em `docs/api/openapi.yaml` (4.3 do caderno). 1.5h.
- **Relatório de Testes** em `docs/relatorio-testes.md` (4.4) com cobertura + integração + carga (k6 ou JMeter). 3h.
- **CHANGELOG.md** + git tags para semver. 1h.

**Features BRT polish (movidas de S7):**
- **Replay temporal** (slider para "voltar no tempo" no Livemap). 6h.
- **Global search Cmd+K** (command palette com fuzzy search). 3h.
- **Onboarding tour** (`react-joyride`). 2.5h.
- **Keyboard shortcuts modal** (Shift+?). 2h.

**Total:** ~44h (apertado em 1.5 sem) — considerar estender para 2 sem se necessário.

---

## 8. Funcionalidades BRT-style Inspiradas em Singapura / Londres

Comparativo com LTA Singapore DataMall, TfL Bus Open Data, TransMilenio, NYC MTA:

| Funcionalidade | Sprint | Notas |
|---|---|---|
| Live map real-time | Já existe | Livemap atual |
| Service alerts (interrupções) | S7 | `ServiceAlert` |
| Bus tracking por rota | Já existe | Livemap filtra |
| Stop ETA predictions | Já existe | `StopPanelService` |
| Headway / bunching | S7 | |
| Dwell time analytics | S7 | |
| Schedule adherence | S1 | Stoplight + route-delays |
| Demand forecasting | S7 | ARIMA |
| O-D matrix | S5 | Após bilhética |
| Ridership analytics | S2+S5 | Após contagem + bilhética |
| Multi-modal integration | Fora | Sem dados de outros modos |
| Open data API (GTFS-RT) | S1 | |
| Operator app companion | Já existe (PainelBordo) | |
| Real-time crowd density | S2 | Heatmap + thresholds |
| Vehicle health dashboard | S4 | FleetHealth |
| Energy/sustainability KPIs | S6 | |
| Driver scheduling | Parcial | Drivers.jsx — pode evoluir |
| Activity feed | S2 | |
| Bookmarks | S3 | |
| Replay temporal | S8b | |
| Global search Cmd+K | S8b | |
| Onboarding tour | S8b | |
| Keyboard shortcuts | S8b | |
| Dark mode | S0 | |
| Print-friendly | S8b (se houver tempo) | |
| What-if simulation | Fora | Avançado |
| Push notifications (Web Push) | Fora | Toasts chegam |
| Dashboard customizável | Fora (Metabase cobre) | |

---

## 9. Anexos

### Anexo A — Catálogo Completo de Findings (Auditoria Adversarial Verificada)

Todos os findings desta secção foram verificados por leitura direta do código em D:\DAIKevin\DAI-main. Veredictos: `CONFIRMED`, `CONFIRMED-COM-AJUSTE`, `FALSE-POSITIVE`, `PARCIAL`.

#### A.1 Segurança — CRITICOS

| ID | Severidade | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|---|
| SEC-1 | CRITICO | `mosquitto/config/mosquitto.conf:2` | CONFIRMED | `allow_anonymous true`. Qualquer cliente publica/subscreve sem credenciais. ACL existe mas não restringe identidade. **Fix amplificado:** atualizar NiFi + simulador + backend para enviar credenciais. | S-1 |
| SEC-2 | CRITICO | `InternalApiKeyFilter.java:36` | CONFIRMED | `key.equals(expectedKey)` vulnerável a timing attack. Fix com `MessageDigest.isEqual(bytes)` é correto. | S-1 |
| SEC-3 | CRITICO | `WebSocketConfig.java:28` | CONFIRMED | `setAllowedOriginPatterns("*")`. Qualquer site malicioso aberto pode subscrever telemetria. | S-1 |
| SEC-4 | CRITICO | `WebSocketConfig.java` | CONFIRMED | Sem `ChannelInterceptor` STOMP. Qualquer cliente subscreve `/topic/telemetry` sem JWT. Fix: implementar interceptor que valida `Authorization` no CONNECT. Frontend precisa passar header em `client.connectHeaders`. | S-1 |
| SEC-5 | CRITICO (CONTEXTUAL) | `SecurityConfig.java:41-43` | CONFIRMED-COM-AJUSTE | Endpoints PainelBordo `permitAll()` no design original. **Fix implementado (2026-05-24):** Keycloak login direto no tablet do bus com role `motorista` + `driver_bus_assignment` no backoffice. Captura identidade do motorista (essencial para bilhética §5.1 e regras 5/6 de fraude). QR pairing considerado e rejeitado — ver Anexo G ponto 8. | S-1 |
| SEC-7 | CRITICO | `keycloak/pgu-realm-realm.json` | CONFIRMED | Passwords `admin123`/`operador123` em texto claro. Fix: remover users, criar via Admin API com UUID gerado. | S-1 |
| SEC-15 / NEW-1 | CRITICO | `SecurityConfig.java:112-113` | CONFIRMED (UPGRADE de MEDIO) | **`allowedHeaders("*")` + `allowCredentials(true)` é proibido por CORS spec. Browsers rejeitam preflight e silenciosamente fazem JWT auth falhar em requests POST.** Isto **explica** porque vários endpoints estão permitAll (para contornar o problema). **Fix urgente:** listar headers explicitamente. | S-1 |

#### A.2 Segurança — ALTOS

| ID | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|
| SEC-6 | `DespachoController` | CONFIRMED-COM-AJUSTE (DOWNGRADE de CRITICO) | ACK aceita `busId` no path mas backend procura mensagem por `messageId` global, sem constraint. Attacker pode enviar ACK para qualquer bus com messageId válido. **Fix:** validar `msg.getBusId() == path.busId`. HMAC dispensável aqui. | S-1 |
| SEC-8 | `application.properties:44` | CONFIRMED | API key tem fallback `changeme-internal-key`. | S-1 |
| SEC-9 | `SecurityConfig.java:49 vs :71` | CONFIRMED-COM-AJUSTE | Bug funcional: `operator` (linha 49) vs `operador` (linha 71). Keycloak realm define `operador`. **Fix seguro:** aceitar **ambos** temporariamente, grep código + frontend, depois deprecate `operator`. | S-1 |
| SEC-10 | `DespachoService.java:82` | CONFIRMED | `log.info` com `conteudo` da mensagem. Sensível. | S-1 |
| SEC-12 | `TelemetryController.java:60` | CONFIRMED | Sem rate limit em `/api/v1/telemetry/ingest`. Melhor mitigar em nginx que em controller. | S-1 (via nginx) |
| SEC-13 | `nginx.conf.template:97` | CONFIRMED-COM-AJUSTE | `proxy_ssl_verify off` para NiFi. **Em vez de manter off, usar `proxy_ssl_trusted_certificate` com CA bundle.** | S-1 |
| SEC-13b | `nginx.conf.template` | CONFIRMED | Sem security headers (HSTS, CSP, etc.). | S-1 |
| SEC-13c | `nginx.conf.template` | CONFIRMED | Sem rate limiting (`limit_req_zone`). | S-1 |
| SEC-extra | `AuditAspect.java:43` | CONFIRMED | Log de `e.getMessage()` pode revelar SQL/paths. | S-1 |

#### A.3 Segurança — MEDIOS e BAIXOS

| ID | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|
| SEC-11 | `AnexoService.java` | **FALSE-POSITIVE** | **Auditor disse "só por extensão". Verificação: faz dupla validação MIME + extensão.** Fix proposto (`Files.probeContentType`) é melhoria, não crítico. | (Anexo B) |
| SEC-14 | `SecurityConfig.java:45` | CONFIRMED | Actuator endpoint público. Restringir a `/actuator/health` apenas; resto admin. | S-1 |
| SEC-actuator | `application.properties` | CONFIRMED | Sem `management.endpoints.web.exposure.include` explícito. | S-1 |
| SEC-comment | `InternalApiKeyFilter.java:18` | CONFIRMED | Comentário menciona Airflow (decisão removida). | S-1 |

#### A.4 Backend — ALTOS

| ID | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|
| BE-1 | `TelemetryService.processAndSaveTelemetry` | CONFIRMED | Sem `@Transactional`. Crash entre saves deixa estado inconsistente. | S-1 |
| BE-2 | `OcorrenciaService:182` | CONFIRMED | `findAll()` + filtro em memória. OOM para volume grande. | S-5 |
| BE-3 | `ExportService:269` | CONFIRMED-COM-AJUSTE | `findAll()` para gerar export. **Fix com `Stream<>` requer Hibernate fetch-size manual ou Spring Batch.** | S-5 |
| BE-4 | `Route.java:24` | CONFIRMED-COM-AJUSTE | `@OneToMany(fetch=EAGER)` em `routeStops`. **Fix com LAZY precisa de `@EntityGraph` em todas as queries que usam Route com stops, e auditar serialização JSON existente.** | S-4 |
| BE-5 | `TelemetryController` | CONFIRMED | Sem paginação. | S-2 |
| BE-6 | Globalmente | CONFIRMED | Sem `@RestControllerAdvice`. | S-1 |
| BE-7 | `OcorrenciaController` | CONFIRMED | `Map<String,String>` em vez de DTOs. | S-1 |
| BE-8 | `BusController:51-54` | CONFIRMED | `RuntimeException` em batch validation → 500. Deve ser `@Min/@Max` → 400. | S-1 |

#### A.5 Backend — MEDIOS

| ID | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|
| BE-9 | `TelemetryController:59-68` | CONFIRMED | Broadcast WS no controller. | S-1 |
| BE-10 | `RouteController:45-52` | **FALSE-POSITIVE** | **Auditor disse "retry infinito". Verificação: é retry único defensivo contra race condition. Sem loop.** | (Anexo B) |
| BE-11 | `ExportService:213` | CONFIRMED-COM-AJUSTE | Tem `@Transactional` (não missing) mas não é `REQUIRES_NEW`. Melhoria, não obrigatório. | S-4 |
| BE-12 | `AlertaService:34` | CONFIRMED | `@Autowired` em field. | S-1 |
| BE-13 | `BusService:96-101` | CONFIRMED-COM-AJUSTE | `stream().max()` para próximo código. **Fix com SQL `SELECT MAX` ainda tem race condition. Melhor: Sequence PostgreSQL (`@GeneratedValue strategy=SEQUENCE`).** | S-5 |
| BE-14 | `GtfsService:735` | CONFIRMED | `findAll()` em vez de `findByRouteId`. | S-5 |
| BE-15 | `V1__create_vehicle_telemetry.sql` | CONFIRMED | Sem índice composto `(bus_id, recorded_at)`. | S-1 |
| BE-16 | `V15__create_ocorrencias.sql` | CONFIRMED | Sem índices compostos `(estado, timestamp_abertura)`, `(ativo_id, estado)`. | S-1 |
| BE-17 | `vehicle_telemetry` schema | CONFIRMED | Sem particionamento. Estimativa 17M/dia → 6B/ano (5s interval × 100 buses). **Fix: Flyway não migra dados automaticamente — usar `pg_partman` ou migração manual.** | S-2 (movido de S4) |
| BE-18 | `application.properties` | CONFIRMED | Sem profiles split. | S-1 |
| BE-19 | `application.properties` | CONFIRMED | HikariCP não configurado. | S-1 |
| BE-20 | `application.properties` | CONFIRMED | Sem compression / graceful shutdown. | S-1 |
| BE-21 | Globalmente | CONFIRMED | Sem cache. Candidatos: GTFS schedules, Routes, Stops. | S-0 |

#### A.6 Backend — BAIXOS

| ID | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|
| BE-22 | `pgu/Dockerfile` | CONFIRMED | Sem USER não-root, sem HEALTHCHECK, sem .dockerignore. | S-1 |

#### A.7 Frontend — ALTOS

| ID | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|
| FE-1 | `App.jsx` | CONFIRMED | Sem lazy loading. Pattern em S0; refactor mínimo. | S-0 |
| FE-2 | `Livemap.jsx markers` | **FALSE-POSITIVE** | **Auditor alegou memory leak por recriação de markers. Verificação: código usa `busMarkersRef.current[telemetry.busId]` para reutilizar instâncias. Linha 113 mostra `const existing = busMarkersRef.current[telemetry.busId]`. Padrão `setLatLng()`/`setIcon()`/`setPopupContent()` está correto. Cleanup em linhas 235-238. WeakMap desnecessário.** | (Anexo B) |
| FE-3 | `api.js` | CONFIRMED | Sem timeout. | S-1 |
| FE-4 | Globalmente | CONFIRMED | Sentry ausente. **Para plataforma fechada interna, Sentry self-hosted é mais seguro que cloud.** | S-8b |
| FE-5 | `ProtectedRoute.jsx` | CONFIRMED | Valida só authenticated, não roles. | S-0 |
| FE-6 | `App.jsx` | CONFIRMED | `Drivers.jsx` órfão (sem rota), código está completo. | S-1 |
| FE-7 | `Livemap.jsx WS` | CONFIRMED-COM-AJUSTE | Reconnect não re-subscribe. `GlobalToastListener.jsx` tem mesmo problema. Refactor com callback reutilizável. | S-2 ou S-0 |
| FE-18 | `Livemap.jsx` | CONFIRMED (descoberto na verificação) | `backendBusesRef.current` para filtros mas nunca atualizado sem `backendBuses` state change — stale filtering. | S-2 |
| FE-19 | `api.js` | CONFIRMED (descoberto) | Interceptor não trata 403 Forbidden. | S-0 |

#### A.8 Frontend — MEDIOS e BAIXOS

| ID | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|
| FE-8 | `PainelBordo.jsx:19-22` | **FALSE-POSITIVE** | **Auditor: `setInterval` sem cleanup. Verificação: useEffect retorna `clearInterval` (linha 21).** | (Anexo B) |
| FE-9 | `Modal.jsx:7-9` | **FALSE-POSITIVE** | **Auditor: ESC handler sempre ativo. Verificação: tem `if (!open) return;` antes do `addEventListener`. Listener só é adicionado quando open=true.** | (Anexo B) |
| FE-9-extra | `Modal.jsx` | CONFIRMED | Sem `aria-modal`, `role="dialog"`, focus trap. | S-1 |
| FE-10 | `AnalyticsDashboard.jsx` | PARCIAL | Usa `AbortSignal` que dá timeout via abort, mas não tem timeout individual per request. | S-2 |
| FE-11 | `Livemap.jsx heatmap` | **FALSE-POSITIVE** | **Auditor: recalculado sem necessidade. Verificação: `setInterval(fetchHeatmap, 60000)` é refresh intencional, não bug.** | (Anexo B) |
| FE-12 | `vite.config` | CONFIRMED | Sem code splitting manual. Vite faz auto, mas manualChunks daria melhor split. | S-8b |
| FE-13 | `Layout.css` | CONFIRMED | Sem media queries (<768px). | S-8b |
| FE-14 | `Stops.jsx:69` | CONFIRMED | `window.confirm()` em vez de Modal. | S-1 |
| FE-15 | `Ocorrencias.css` | PARCIAL | Grid responsivo mas modal pode ser cortado em mobile. | S-8b |
| FE-16 | `AuthProvider.jsx:32-37` | **FALSE-POSITIVE** | **Auditor: sem retry de refresh. Verificação: `keycloak-js` faz retry interno. `.catch()` faz logout após falha — aceitável.** | (Anexo B) |
| FE-17 | `GlobalToastListener.jsx` | CONFIRMED | WS sem heartbeat. | S-0 |
| FE-20 | `AnalyticsDashboard.jsx:108-113` | CONFIRMED (descoberto) | Normalização de delays com `stoppedCount: 0` parece bug. | S-1 |
| FE-a11y | `Layout.jsx` | CONFIRMED | NavLink icons sem `aria-label`. | S-1 |
| FE-abort | Globalmente | CONFIRMED | Stops/Ocorrencias popups sem `AbortController`. | S-0 |

#### A.9 Infraestrutura

| ID | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|
| INFRA-1 | `docker-compose.yml nifi` | CONFIRMED | NiFi sem memory limit. | S-1 |
| INFRA-2 | `docker-compose.yml` | PARCIAL | Mosquitto/NiFi/OSRM com `service_started` em vez de `service_healthy`. Postgres/MongoDB/Keycloak já OK. | S-1 |
| INFRA-3 | `docker-compose.yml metabase` | CONFIRMED | Sem healthcheck. | S-1 |
| INFRA-4 | `osrm/Dockerfile` | CONFIRMED | Download 600MB a cada build. | S-8a ou cache mount. |
| INFRA-5 | `docker-compose.yml` | PARCIAL | Maioria tem `restart: unless-stopped`. **Orion (linha 121) não tem.** | S-1 |
| INFRA-6 | `docker-compose.yml` | CONFIRMED | Sem `logging.driver` (json-file com rotação). | S-1 |
| INFRA-7 | `docker-compose.yml keycloak` | CONFIRMED | `start-dev` em prod mode. | S-8a |
| INFRA-8 | `.env.example` | CONFIRMED | DOMAIN hardcoded. | S-1 |
| INFRA-9 | `postgres-init/init-tools.sql` | CONFIRMED | Sem roles separadas por aplicação. | S-8a |
| INFRA-10 | `docker-compose.yml orion` | CONFIRMED (descoberto) | Orion sem healthcheck **e** sem restart. | S-1 |
| INFRA-11 | `docker-compose.yml toolsbd` | CONFIRMED (descoberto) | `pg_isready -U ${TOOLS_DB_USER}` sem database param. | S-8a |
| INFRA-nginx | `nginx.conf.template` | CONFIRMED | Sem security headers. | S-1 |
| INFRA-nginx-rate | `nginx.conf.template` | CONFIRMED | Sem rate limiting. | S-1 |
| INFRA-dockerignore | `pgu/` | CONFIRMED | Sem `.dockerignore`. | S-1 |

#### A.10 Observabilidade

| ID | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|
| OBS-1 | `pgu/pom.xml` | CONFIRMED | Sem `micrometer-prometheus`, sem tracing. | S-0 (dep) + S-8a (config) |
| OBS-2 | `application.properties` | CONFIRMED | Sem `logback-spring.xml` (logging plain text). | S-8b |
| OBS-3 | `application.properties` | CONFIRMED | Sem liveness/readiness probes. | S-8a |
| OBS-4 | Globalmente | CONFIRMED | Sem `traceId/spanId` em logs. | S-8b |

#### A.11 CI/CD & Backups

| ID | Local | Veredicto | Descrição | Sprint |
|---|---|---|---|---|
| CICD-1 | `.github/workflows` | CONFIRMED | Sem pipeline. | S-8b |
| CICD-2 | Globalmente | CONFIRMED | Sem `dependabot.yml`. | S-8b |
| CICD-3 | `pom.xml` | CONFIRMED | Versão `0.0.1-SNAPSHOT` permanente. | S-8b |
| BAC-1 | Postgres | CONFIRMED | Sem WAL archiving. | S-8a |
| BAC-2 | Globalmente | CONFIRMED | Sem doc RTO/RPO. | S-8a |
| BAC-3 | Backups | CONFIRMED | Sem backup de Keycloak/MongoDB/NiFi config. | S-8a |

---

### Anexo B — Falsos Positivos Identificados (Verificação Adversarial)

**Importante:** estes findings foram considerados e descartados durante a verificação. Documentados aqui para que não voltem a aparecer em revisões futuras.

| ID | Finding original | Por que é falso positivo |
|---|---|---|
| SEC-11 | `AnexoService` mime type só por extensão | **Faz dupla validação MIME (linhas 77-81) + extensão (88-92). Ambas têm de passar.** Adicionar `Files.probeContentType()` é melhoria, não crítico. |
| BE-10 | `RouteController` retry infinito | **É retry único defensivo contra race de INSERT concorrente. Sem loop.** Comportamento correto. |
| FE-2 | Livemap markers memory leak | **Usa `busMarkersRef.current[busId]` para reutilizar instâncias.** Cleanup em linhas 235-238. WeakMap desnecessário. |
| FE-8 | PainelBordo `setInterval` sem cleanup | **`useEffect` retorna `clearInterval(handle)` (linha 21).** Cleanup correto. |
| FE-9 | Modal ESC handler sempre ativo | **Tem `if (!open) return;` antes de `addEventListener`. Listener só ativo quando `open=true`.** |
| FE-11 | Heatmap recalculado sem necessidade | **`setInterval(fetchHeatmap, 60000)` é refresh intencional.** Não é bug. |
| FE-16 | AuthProvider sem retry de refresh | **`keycloak-js` faz retry interno. `.catch()` faz logout após falha — aceitável.** |
| INFRA-5 (parcial) | Sem `restart: unless-stopped` | **Maioria dos serviços já tem.** Apenas Orion estava em falta. |

---

### Anexo C — Mapa Requisito → Sprint

| Requisito | Sprint | Status alvo |
|---|---|---|
| R.IVT.01–11 | S1 | 100% |
| R.IMC.01–09 | S4 | 100% |
| R.IPB.01–10 | S5 | 100% |
| R.ICP.01–10 | S2 | 100% |
| R.IPM.01–10 | S3 | 100% |
| R.ICE.01–14 | S6 | 100% |
| R.UI.03, .10, .31 | S0 | 100% |
| R.UI.* restantes (exc. fora de scope) | distribuído | ~80% |
| R.BO.01, .03, .05, .09 | S0/S8a | 100% |
| R.DL.* | parcial em todos | ~75% (sem Data Lake formal) |
| R.ID.01–09 | S0 | 100% |
| R.ID.10–19 (jobs) | já + S0 + S8a | ~85% (alternativa a Airflow documentada) |
| R.ID.20–26 (no-code) | já | 100% (NiFi) |
| R.ID.27–39 (IA) | S7 (parcial) | ~40% (foco em chatbot, não em ingestão IA) |
| R.AN.* | S7/S8a | ~90% |
| R.PP.* | — | Fora de scope (justificado §5.3) |
| R.PDA.* | opcional | Minimalista se houver tempo |
| R.IA.01–07 | S7 | 100% |
| R.INT.* | S0 a S8a | ~90% |
| R.SW.* | já | 100% |
| R.CLOUD.05 | S8a | 100% |
| R.CLOUD.01, .03, .06, .07 | S8a | 100% |
| R.CLOUD.02, .04, .08 | — | Documentado como evolução (Azure free tier) |
| R.SEC.01–08 | distribuído + S8a | ~85% |
| R.AUT.01, .02, .04, .05–.15 (exc. .03, .13) | S0/já | ~95% |
| R.AUT.03 | — | Substituído por AD municipal |
| R.BAC.01–09 | S8a | 100% |

---

### Anexo D — Modelo de Dados Proposto — Visão Global

Novas entidades a criar (resumo):
- `DataSource` (S0)
- `Operator` (S1)
- `PassengerSensor` (S2)
- `DisplayPanel`, `DisplayPanelEvent` (S3)
- `VehicleDiagnostic` (S4)
- `TicketValidation` (S5 — tri-modal: CARD + MOBILE_QR + ONBOARD_PAPER, com `chk_source_fields` constraint)
- `TicketType` (S5 — catálogo: `PASSE_MENSAL`, `PASSE_SENIOR`, `PASSE_ESTUDANTE`, `BILHETE_AVULSO_MOBILE`, `BILHETE_AVULSO_PAPEL`)
- `PaperTicketReconciliation` (S5 — fim-de-turno, com `fraud_flags[]` e workflow PENDING/RECONCILED/DISPUTED/FRAUD_INVESTIGATION)
- `ChargingStation`, `ChargingSession` (S6)
- `ServiceAlert` (S7)
- `ApiAccessLog` (S0), `AiInteractionLog` (S7)

Total de migrações estimadas: V25 a ~V42.

Schemas detalhados:
- `ticket_validation` e `paper_ticket_reconciliation` — ver §5.1.
- Outras schemas estão descritas em cada sprint.

---

### Anexo E — Arquitetura IA com Privacidade

Ver §5.2.

Componentes:
- Ollama container (rede `ai_net` isolada, sem internet).
- `AiChatController` (Spring Boot).
- `AiToolRouter` com lista fechada de ~10 tools.
- `Chatbot.jsx` (frontend).
- `ai_interaction_log` (audit).
- `AiMonitoring.jsx` (MLOps dashboard).

---

### Anexo F — DAG de Dependências entre Sprints

#### F.1 Grafo principal

```
S-1 (HARDENING) — sem dependências, deixa: API key segura, MQTT auth,
                  WS protegido, roles consistentes, security headers,
                  @RestControllerAdvice, profiles split, índices compostos
                  ↓
S0 (FUNDAÇÕES) — usa: roles consistentes (S-1), advice (S-1)
                 deixa: Smart Data Models, NGSI-LD proxy, DataSource,
                 MFA, i18n, tema escuro, cluster/layers, Micrometer base,
                 routes manifest, lazy loading pattern, api_access_log
                 ↓
S1 (3.1)        — usa: Smart Data Models (Vehicle), NGSI-LD, i18n
                  deixa: GTFS-RT, NeTEx, Operator, indicadores cobertura
                  ↓
S2 (3.4)        — usa: Smart Data Model PassengerCount, DataSource, alerts
                  deixa: telemetria refactored, particionamento, ticket_validation (vazio)
                  ↓                ↘
                  S3 (3.5) ←  paralelizável com S2 ou S4 (independente)
                  ↓                  ↓
                  S4 (3.2)         (continua paralelo)
                  ↓
                  S5 (3.3)        — usa: ticket_validation table (S2), telemetria (S2/S4)
                  ↓                ↘
                  S6 (3.6) ←  paralelizável com S5 (independente)
                  ↓                  ↓
                  ↓                  ↓
                  ↓                  ↓
                  S7 (IA + BRT)   — usa: TUDO (tools chamam datasets de cada vertical)
                  ↓
                  S8a (Conformidade) — usa: Micrometer (S0), todos os dados
                  ↓
                  S8b (Qualidade)
```

#### F.2 Cross-cutting concerns (transversais a todos os sprints)

| Concern | Estabelecido em | Aplicado em |
|---|---|---|
| `@RestControllerAdvice` global | S-1 | S0+ (todos os novos controllers) |
| Profiles Spring (`-prod`, `-docker`) | S-1 | S0+ (todas as novas configs vão para o profile certo) |
| Smart Data Models | S0 | S1, S2, S3, S4, S5, S6 (vertical-específicos) |
| NGSI-LD proxy | S0 | S2, S3, S4, S5, S6 (endpoints específicos) |
| `DataSource` pulse pattern | S0 | S1, S2, S3, S4, S5, S6 (cada novo componente publica pulse) |
| `routes.js` + `navItems` config | S0 | S0+ (cada nova página adiciona ao manifest) |
| Lazy loading pattern | S0 | S0+ (cada nova página pesada usa `React.lazy`) |
| Micrometer base | S0 | S1, S2, S3, S4, S5, S6, S7 (cada componente adiciona métricas) |
| `api_access_log` filtro | S0 | (transversal automático) |
| Cache `@Cacheable` | S0 | S1, S2 (queries hot) |
| AbortController em fetch | S0 | S0+ (novos popups, requests) |

#### F.3 Race conditions em ficheiros partilhados (mitigações)

| Ficheiro | Sprints | Mitigação |
|---|---|---|
| `SecurityConfig.java` | S-1, S0, S5, S7 | Convention de adição em S-1: cada novo endpoint = nova `requestMatchers` no fim com comentário de bloco identificando sprint |
| `application.properties` / `-prod` / `-docker` | S-1, S0, S4, S7, S8 | Profile split em S-1 antes de qualquer mudança subsequente |
| `docker-compose.yml` | S-1, S7, S8a, S8b | Adições incrementais, baixo risco |
| `App.jsx` | S-1, S0, S1-S7 | **`routes.js` manifest** estabelecido em S0 — sprints seguintes editam manifest, não App.jsx |
| `Layout.jsx` (sidebar nav) | S0, S1-S7 | **`navItems` config** estabelecido em S0 — sprints seguintes editam config |
| NiFi templates | S0, S2, S3, S4, S5, S6 | Naming convention de processGroups por vertical |
| Simulator (Python) | S2, S3, S4, S5, S6 | **Estruturar como plugins por vertical em S2** |
| `vehicle_telemetry` schema | S2, S4 | Particionamento em S2 antes do refactor; S4 acrescenta colunas a partition pattern existente |
| `index.css` design tokens | S0, S8b | OK (S0 estabelece, S8b acrescenta print) |

#### F.4 Critical path

**Caminho mais longo (1 dev FT):**

```
S-1 (5d) → S0 (10d) → S1 (10d) → S2 (10d) → S4 (10d) → S5 (10d) → S6 (7.5d) → S7 (10d) → S8a (7.5d) → S8b (7.5d)
                              ↘ S3 (5d, paralelo a S2 ou S4)
                                                      ↘ Verticais 3.1-3.6: ~60 dias
                                                                            Total até produção: ~85 dias úteis (~17 semanas)
```

**Com 2 devs (paralelizando S3 e S6):**

```
Critical path: S-1 → S0 → S1 → S2 → S4 → S5 → S7 → S8a → S8b ≈ 75 dias úteis (~15 semanas)
Paralelo: S3 (durante S2/S4), S6 (durante S5)
```

#### F.5 Análise de carga por sprint

| Sprint | Esforço (h) | Duração (1 dev) | Avaliação |
|---|---:|---|---|
| S-1 | 40 | 5 dias | OK |
| S0 | 67 | 2 sem | Apertado mas viável |
| S1 | 42 | 2 sem | OK |
| S2 | 32 | 1.5 sem | OK |
| S3 | 25 | 1 sem | Leve (pode absorver mais se preciso) |
| S4 | 33 | 1.5 sem | OK |
| S5 | 52 | 2 sem | **Apertado** (aumentou de 34h→52h por bilhética trí-modal + ETM + reconciliação + fraude base). Overflow de ~5h pode ir para S6 (leve) ou estender meio dia. |
| S6 | 26 | 1.5 sem | OK |
| S7 | 59 | 2 sem | OK (50h core + 9h regras avançadas de fraude que dependem de S2+S5) |
| S8a | 30 | 1.5 sem | OK |
| S8b | 44 | 1.5-2 sem | Apertado (considerar estender 2 sem) |

**Total:** ~450h ≈ ~18 semanas FT (1 dev). Com folga para imprevistos: **19-21 semanas realistas**.

**Crescimento de carga vs versão anterior:**
- S5: +18h (componente papel/ETM, reconciliação, 3 regras fraude base, dashboards adicionais, simulador estendido, DPIA mais detalhado)
- S7: +9h (3 regras fraude avançadas que dependem de cross-vertical: APC sensor, driver patterns, GPS-time)
- **Total: +27h (~1 semana). Justificado pela completude do canal de venda papel que reflete prática real TUB e cria um vertical de "fraude operacional" mais robusto.**

---

### Anexo G — Decisões de Arquitetura que Justificar no Relatório Final

Para o relatório do trabalho (caderno seção 4 — Entregáveis e Documentação):

1. **Substituição de Airflow por Spring Scheduler interno** (R.ID.11/12 — apresentar como alternativa fundamentada).
2. **Plataforma fechada sem Portal Público** (R.PP.* — delegado ao website TUB).
3. **Bilhética Conventional+Mobile** (em vez de CiCo/CiBo/BiBo — acessibilidade idosos).
4. **IA on-premises com tools restritas** (em vez de cloud LLMs — RGPD/NIS2).
5. **Sem Load Balancer / HA** (R.CLOUD.04/08 — limitação Azure free tier).
6. **Sem Data Lake formal** (R.DL.04 — DW PostGIS suficiente para âmbito).
7. **Autenticação interna em vez de Autenticação.gov** (R.AUT.03 — funcionários TUB).
8. **Painel de bordo com Keycloak direto no tablet do bus** (em vez de QR pairing entre tablet + telemóvel do motorista). **Rationale:** captura imediata de identidade do motorista (necessária para `paper_ticket_reconciliation.driver_id` e regras 4-5 de fraude do §5.1); evita 3ª interface (app mobile) que duplicaria esforço de demo e manutenção; mitiga password-typing-on-shared-tablet com auto-logout por inatividade + botão "Terminar turno" + tokens curtos. Aceita-se trade-off de UX vs simplicidade arquitetural no scope académico.

---

## 10. Próximos Passos Imediatos

1. **Validar este plano com o orientador** — confirmar prioridades e disponibilidade de equipa.
2. **Confirmar UC6/ e UC7/** (pastas vazias) — verificar se são placeholders para entregáveis específicos.
3. **Limpar `AUDITORIA_FEATURES.md`** (todo o conteúdo está agora aqui — pode ser apagado ou substituído por stub que redireciona para este documento).
4. **Começar Sprint -1** pelo item de menor risco: **fix CORS + credentials** (0.5h, desbloqueia JWT POST imediatamente) seguido de **role consistency `operator`/`operador`** (1.5h, desbloqueia bug funcional).
5. **Configurar `PGU_TICKET_SALT` em env vars** (preparação para S5, antes de qualquer ingestão).
6. **Estabelecer convention de naming** para NiFi processGroups antes de S2 começar a adicionar pipelines.
7. **Painel de bordo + role `motorista` + `driver_bus_assignment` já implementado** (pre-Sprint -1, 2026-05-24). Endpoints: `GET /drivers/me/bus`, `POST /despacho/{busId}/mensagens/motorista`, `POST /ocorrencias/motorista`. Migrações V25 (`keycloak_user_id` em drivers) + V26 (fix tipo `bus_id`). Sprint -1 ao aplicar SEC-5 deve **manter** este modelo (Keycloak no tablet) e apenas endurecer auto-logout + token TTL.

---

*Documento vivo. Atualizar a cada fim de sprint com:*
- *o que foi concluído (vs planeado)*
- *findings novos descobertos durante implementação*
- *ajustes ao plano para sprints seguintes*
- *re-verificação adversarial dos findings antes de cimentar novos*
