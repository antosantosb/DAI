# Conformidade RGPD e NIS2 - Fundação Técnica (PGU-TUB)

> **Estado:** Documento de fundação (input para os entregáveis formais de conformidade).
> **Plataforma:** Plataforma de Gestão Urbana dos Transportes Urbanos de Braga (PGU-TUB).
> **Stack:** Spring Boot 4.0.5 (Java 21) + React 19 + Keycloak 26 + PostgreSQL/PostGIS + FIWARE Orion + Mosquitto + NiFi + MinIO + Ollama, orquestrados em Docker Compose.
> **Natureza:** Projeto académico (DAI 2025/26) entregue PARA o operador TUB. Partes assinaladas como "a executar pela TUB" (parecer formal do DPO, pen-tests por terceiro, registo junto da CNPD e do CSIRT) não fazem parte do âmbito académico mas ficam aqui especificadas para execução real.

Este ficheiro está fundamentado por leitura direta do código (não é boilerplate). As referências `pgu/...`, `nginx.conf.template`, `docker-compose.yml`, `keycloak/pgu-realm-realm.json`, `mosquitto/config/...` apontam para os ficheiros reais do repositório.

---

## 1. Objetivo e âmbito

### 1.1 Objetivo

Servir de base única e fundamentada a partir da qual se redigem os entregáveis formais de conformidade do projeto, evitando duplicação e garantindo que cada afirmação tem evidência no código. Alimenta diretamente:

| Entregável formal | Regulação | Secção-fonte deste documento |
|---|---|---|
| DPIA (Avaliação de Impacto sobre a Proteção de Dados) | RGPD (UE) 2016/679 + Lei 58/2019 | §2 |
| Registo de atividades de tratamento (Art. 30.º RGPD) | RGPD | §2.2 + §2.3 |
| Plano de gestão de riscos de cibersegurança | NIS2 (Diretiva (UE) 2022/2555) | §3.1, §3.2 |
| Relatório de conformidade NIS2 | NIS2 | §3.3 |
| Plano de resposta e notificação de incidentes (CSIRT) | NIS2 (Art. 23.º) | §3.4 |
| Registo de testes de penetração e auditorias técnicas | NIS2 / ISO 27001 | §3.5 |
| Plano de continuidade e recuperação (BCP/DRP) | NIS2 (Art. 21.º) | §3.6 |
| Relatórios de auditoria de segurança e compliance | NIS2 / RGPD / ISO 27001 | §4 |

### 1.2 Âmbito da plataforma (o que a PGU faz e NÃO faz)

A PGU **monitoriza e governa** a operação de transporte: ingere telemetria de veículos via MQTT, processa-a em ETL (NiFi), persiste em PostGIS e FIWARE Orion (NGSI-LD), e expõe painéis operacionais (live map, despacho, ocorrências, analytics) e dados abertos (GTFS-RT, NeTEx, DCAT-AP).

Pontos críticos para conformidade:

- A PGU **não opera a bilhética nem armazena números de cartão reais**. Ingere e monitoriza os eventos de bilhética produzidos pela TUB (ver §2.2, fluxo F5).
- A telemetria de veículos (posição, velocidade, ocupação agregada do autocarro) **não constitui dado pessoal**: identifica veículos e linhas, não pessoas.
- Os dados pessoais existentes são poucos e bem delimitados (contas Keycloak de pessoal interno, emails, avatares, eventos de bilhética pseudonimizados, ocorrências reportadas por motoristas).

### 1.3 Limitação académica honesta

O âmbito académico cobre **desenho e implementação dos controlos técnicos**. Não cobre: nomeação e parecer assinado de um DPO, contratação de pen-test por entidade externa certificada, registo formal como entidade essencial/importante NIS2, nem notificação real ao CSIRT nacional. Esses passos ficam especificados como ação da TUB.

---

## 2. RGPD / DPIA

### 2.1 Necessidade de DPIA

O tratamento envolve monitorização sistemática de operação de transporte em larga escala e cruzamento de eventos de bilhética. Pela orientação do Art. 35.º RGPD e listas da CNPD, justifica-se DPIA. Este documento fornece o inventário, a análise de risco e as medidas; o DPIA formal acrescenta o parecer do DPO e a aprovação da gestão (§2.6).

### 2.2 Inventário de fluxos de dados pessoais

Legenda de base legal: **(f)** interesse legítimo (Art. 6.º(1)(f)); **(b)** execução de contrato (Art. 6.º(1)(b)); **(c)** obrigação legal (Art. 6.º(1)(c)).

| ID | Fluxo / dados | É dado pessoal? | Finalidade | Base legal | Retenção proposta | Quem acede |
|---|---|---|---|---|---|---|
| **F0** | Telemetria de veículos (lat/lon, velocidade, ocupação do veículo, `busId`) via MQTT `tub/telemetry` → NiFi → PostGIS/Orion | **Não** (identifica veículo, não pessoa) | Operação, ETA, analytics | n/a | Operacional + agregados | `admin`, `funcionario` (tópico `/topic/telemetry`) |
| **F1** | Contas de pessoal interno em Keycloak (username, nome, email, role) | **Sim** | Autenticação, autorização, audit | (b)/(c) relação laboral | Enquanto colaborador + período legal | Próprio (self-service `/api/v1/me`), `admin`, `developer` |
| **F2** | Avatares de utilizador (imagem de perfil) | **Sim** | Identificação visual no backoffice | (f) | Enquanto conta ativa | Próprio, `admin` |
| **F3** | Emails transacionais (recuperação de password, notificações) via SMTP/Mailpit | **Sim** | Gestão de conta, notificações | (b)/(f) | Não retido pela PGU (entregue ao MTA) | Sistema |
| **F4** | Ocorrências reportadas pelo motorista (`POST /api/v1/ocorrencias/motorista`, tabela `ocorrencias`, V15) com autor identificado pelo JWT | **Sim** (autor é identificável) | Gestão de manutenção e incidentes operacionais | (f)/(b) | Ciclo de vida da ocorrência + histórico | `motorista` (cria), `maintenance`, `funcionario`, `admin` |
| **F5a** | Bilhética CARTÃO: `card_pseudo_id` = SHA-256(nº cartão real + salt). **Nunca o número real.** | **Sim** (pseudonimizado) | Análise de procura, deteção de fraude | (f) | Agregação rápida; pseudo-id com retenção curta | Analytics (agregado), `admin` |
| **F5b** | Bilhética APP TUBmobile: identificador de conta da app, viagens com origem-destino **real** (check-in QR + check-out na app), email de recibo | **Sim** | Cálculo de trajeto/transbordos, recibo, analytics O-D | (b) (relação com utilizador da app) + (f) (analytics) | O-D individual: retenção curta; agregados: indefinido | `admin`, analytics |
| **F5c** | Bilhete de bordo em dinheiro (papel): serial + timestamp + linha + motorista | **Não** (sem dado do passageiro) | Reconciliação, anti-fraude operacional | n/a (passageiro); (f) p/ motorista | Operacional | `admin`, `funcionario` |
| **F6** | Logs de auditoria: `audit_log` (V12) e `api_access_log` (V29) contêm `username` e `ip` | **Sim** (username + IP) | Segurança, rastreabilidade, investigação de incidentes | (c)/(f) | Definir (proposta: 6-12 meses) | `admin`, `developer` |
| **F7** | `ai_interaction_log` (V37): interações com o chatbot, associadas a utilizador interno | **Sim** | Auditoria e MLOps do assistente IA | (f) | Definir | `admin`, `developer` |

> **Importante para o DPIA:** o modelo de bilhética está a ser desenhado para minimização. O cartão usa `card_pseudo_id` (SHA-256 + salt), a app usa identificador de conta e só a app captura origem-destino real (o cartão é tap-in apenas, sem destino), e o papel não tem qualquer dado pessoal. O número de cartão real **nunca entra na PGU**.

### 2.3 Registo de bases legais (resumo Art. 30.º)

| Base legal | Fluxos | Justificação |
|---|---|---|
| Art. 6.º(1)(b) execução de contrato | F1, F3, F5b | Relação laboral (pessoal) e relação com o utilizador da app TUBmobile |
| Art. 6.º(1)(c) obrigação legal | F1, F6 | Deveres laborais e de manutenção de registos/segurança |
| Art. 6.º(1)(f) interesse legítimo | F2, F4, F5a, F5b (analytics), F6, F7 | Segurança da plataforma, deteção de fraude, análise operacional de procura. Requer teste de proporcionalidade documentado no DPIA. |

Direitos dos titulares (a operacionalizar pela TUB enquanto responsável pelo tratamento): acesso, retificação, apagamento, oposição e portabilidade. A PGU suporta-os tecnicamente via gestão de contas Keycloak e self-service `/api/v1/me`.

### 2.4 Avaliação de riscos e mitigações

Escala: Probabilidade/Impacto = Baixo (B) / Médio (M) / Alto (A).

| ID | Risco | Prob. | Impacto | Medida de mitigação (real na plataforma) | Estado |
|---|---|---|---|---|---|
| R1 | Acesso não autorizado à API | M | A | RBAC por role em `SecurityConfig` (`@EnableMethodSecurity`, matchers por método/role), JWT Keycloak, sessões STATELESS | Implementado |
| R2 | Interceção de tráfego (MITM) | M | A | TLS 1.2/1.3 + HSTS no Nginx (`nginx.conf.template`), Let's Encrypt | Implementado (prod) |
| R3 | Fuga de telemetria em tempo real | M | M | Autenticação JWT obrigatória no frame STOMP CONNECT (`WebSocketSecurityConfig`) | Implementado |
| R4 | Reidentificação via número de cartão | B | A | `card_pseudo_id` = SHA-256 + salt; nº real nunca ingerido | Desenho |
| R5 | Fuga de detalhes internos em erros (SQL, paths) | M | M | `GlobalExceptionHandler` com `ErrorResponse` tipado; mensagens cruas só em DEBUG | Implementado |
| R6 | Abuso / brute force em endpoints | M | M | Rate limiting Nginx (`/api/` 20 r/s, `/auth/` 5 r/s) | Implementado |
| R7 | Acesso anónimo ao broker MQTT | B | A | `allow_anonymous false` + ACL por serviço (`mosquitto/config/acl.conf`) | Implementado |
| R8 | Timing attack na API key interna | B | M | Comparação timing-safe `MessageDigest.isEqual` (`InternalApiKeyFilter`) | Implementado |
| R9 | Exfiltração de dados para LLM na cloud | B | A | IA on-premises (Ollama) em rede `ai_net` isolada, sem internet; tool router com lista fechada | Implementado |
| R10 | Movimento lateral entre serviços | M | A | Micro-segmentação em redes Docker dedicadas (§4.2) | Implementado |
| R11 | Perda de dados (sem backups) | M | A | **Lacuna.** Backups planeados para Sprint 8a (ver §3.6, §6) | Por implementar |
| R12 | Falha de nó único (sem HA) | M | M | **Lacuna documentada.** Single-node Docker Compose | Aceite (âmbito) |

### 2.5 Medidas técnicas reais (pseudonimização, cifra, controlo de acessos)

**Pseudonimização / minimização**
- `card_pseudo_id` (SHA-256 + salt) em vez do número de cartão real; o número real nunca entra na PGU.
- Bilhete de bordo em papel sem qualquer dado pessoal do passageiro.
- Logs de erro com mensagens truncadas e ofuscadas (`safeMessage` no `GlobalExceptionHandler`; `AuditAspect` não emite `e.getMessage()` acima de DEBUG e trunca a 500 chars na BD).

**Cifra**
- Em trânsito: TLS 1.2/1.3 no Nginx com HSTS `max-age=31536000; includeSubDomains`; certificados Let's Encrypt/Certbot.
- Tokens: JWT assinados emitidos pelo Keycloak; validados como OAuth2 Resource Server no backend.

**Controlo de acessos**
- Autenticação federada via Keycloak (realm `pgu-realm`), roles `admin`, `funcionario`, `motorista`, `developer`.
- MFA TOTP configurado no realm (`otpPolicyType: totp`, 6 dígitos, período 30s) com required action `CONFIGURE_TOTP`; passwords iniciais `temporary: true` + `UPDATE_PASSWORD`.
- Autorização fina por endpoint em `SecurityConfig` (ex.: `POST /api/v1/ocorrencias/motorista` exige role `motorista`; gestão de utilizadores e escrita em recursos restrita a `admin`/`developer`).
- Auditoria: `audit_log` (AOP via `@LogActivity`/`AuditAspect`) e `api_access_log` (filtro `ApiAccessLogFilter`).
- Isolamento de rede: redes Docker dedicadas por domínio (§4.2).

### 2.6 Parecer do DPO (placeholder a preencher pela TUB)

O parecer formal do DPO **não está no âmbito académico**. O DPIA final deve incluir:

- [ ] Identificação e contacto do DPO (Art. 37.º-39.º RGPD).
- [ ] Apreciação da necessidade e proporcionalidade dos tratamentos com base legal (f).
- [ ] Avaliação do risco residual após as medidas da §2.4/§2.5.
- [ ] Recomendações e condições de aprovação.
- [ ] Parecer favorável / condicionado / desfavorável, datado e assinado.

**Evidência de aprovação a recolher:** ata ou despacho de aprovação pela gestão da TUB; registo de versão do DPIA aprovado; eventual consulta prévia à CNPD se o risco residual for elevado (Art. 36.º).

### 2.7 Plano de monitorização contínua e revisão periódica

- [ ] Rever o DPIA pelo menos anualmente ou sempre que mude um fluxo (ex.: ativação do tap-out / passagem a CiCo, novos campos de bilhética).
- [ ] Reavaliar prazos de retenção e aplicar expurgo automático (atualmente por definir em F6/F7).
- [ ] Monitorizar acessos a dados pessoais via `audit_log` e `api_access_log` (consultas-tipo em §4.1).
- [ ] Manter o registo de bases legais (§2.3) sincronizado com o código.

---

## 3. NIS2 e Cibersegurança

### 3.1 Plano de gestão de risco de cibersegurança

A gestão de risco assenta em quatro pilares já materializados no código:

1. **Identidade e acesso** (Keycloak, RBAC, MFA, JWT, API key timing-safe).
2. **Segurança de perímetro e transporte** (Nginx hardening, TLS, rate limiting, headers).
3. **Segmentação de rede** (Zero Trust por redes Docker dedicadas, §4.2).
4. **Observabilidade e auditoria** (`audit_log`, `api_access_log`, `ai_interaction_log`, alertas em tempo real).

Processo proposto: inventário de ativos (§4.2 + stack) → análise de risco (§2.4) → tratamento (medidas §2.5/§3.2) → monitorização (§2.7/§3.4) → revisão periódica.

### 3.2 Avaliação de vulnerabilidades e plano de mitigação

**Controlos já implementados (evidência no código):**

| Controlo | Evidência |
|---|---|
| Hardening de HTTP | `nginx.conf.template`: HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection` |
| Rate limiting | `limit_req_zone` api=20r/s (burst 40), auth=5r/s (burst 10), `limit_req_status 429` |
| TLS forte | `ssl_protocols TLSv1.2 TLSv1.3`, `ssl_prefer_server_ciphers on`, Let's Encrypt |
| Autenticação MQTT | `allow_anonymous false` + ACL por serviço (`backend`, `simulator`, `nifi`, `bus`) |
| API key resistente a timing attack | `InternalApiKeyFilter` com `MessageDigest.isEqual` |
| WebSocket autenticado | `WebSocketSecurityConfig` valida JWT no CONNECT STOMP |
| Erros sem fuga de internals | `GlobalExceptionHandler` + `ErrorResponse` |
| Sessões sem estado | `SessionCreationPolicy.STATELESS` |
| IA isolada | Ollama em `ai_net` sem internet |

**Vulnerabilidades / lacunas identificadas (a mitigar):**

| ID | Item | Severidade | Mitigação proposta |
|---|---|---|---|
| V-PEN | Sem pen-test formal por entidade externa | Média | Contratar pen-test (§3.5); âmbito TUB |
| V-ACT | Actuator exposto como `permitAll` em `SecurityConfig` (`/actuator/**`) | Média | Restringir a `/actuator/health` e proteger o resto |
| V-SSL | Realm Keycloak com `sslRequired: none` (adequado a dev) | Média | Definir `sslRequired: external` em produção |
| V-CSP | CSP usa `script-src 'unsafe-inline' 'unsafe-eval'` | Baixa | Endurecer CSP (nonces/hashes) quando o frontend o permitir |
| V-BKP | Sem backups automáticos | Alta | Plano de backups (§3.6, §6) |

### 3.3 Relatório de conformidade NIS2 (mapeamento medida → obrigação)

Mapeamento das medidas de gestão de risco do Art. 21.º da Diretiva (UE) 2022/2555:

| Obrigação NIS2 (Art. 21.º) | Medida na PGU | Estado |
|---|---|---|
| Políticas de análise de risco e segurança de sistemas | §2.4 + §3.1; processo documentado | Parcial (falta formalização TUB) |
| Tratamento de incidentes | §3.4 (deteção via alertas + audit, escalonamento) | Parcial |
| Continuidade de negócio e gestão de backups | §3.6 (plano; backups por implementar) | Lacuna |
| Segurança na aquisição/desenvolvimento (SDLC) | Erros tipados, audit, revisão adversarial de findings (Anexo A do PLANO) | Parcial |
| Avaliação de eficácia das medidas | §3.5 (pen-tests e auditorias) | Por executar |
| Higiene de cibersegurança e formação | MFA obrigatório, passwords temporárias | Parcial |
| Criptografia e cifra | TLS, JWT, hashing de pseudo-id | Implementado |
| Segurança de recursos humanos e controlo de acessos | RBAC Keycloak + audit | Implementado |
| Autenticação multifator | TOTP no realm (`CONFIGURE_TOTP`) | Implementado |
| Segurança da cadeia de fornecimento | Imagens Docker fixadas por versão (ex.: Keycloak 26.2.4); revisão de dependências | Parcial |
| Comunicações seguras (voz/vídeo/texto de emergência) | N/A ao âmbito | N/A |

### 3.4 Plano de resposta e notificação de incidentes (CSIRT)

**Deteção (capacidades reais):**
- Alertas operacionais críticos em tempo real via tópico STOMP `/topic/alertas` (audiência `admin`, `funcionario`) e `/topic/ocorrencias`.
- Registo forense de acessos em `api_access_log` (IP, username, método, path, status, latência) com índices por `ts`, `username`, `path` e por `status >= 400` (deteção de picos de 4xx/5xx).
- `audit_log` regista quem invocou que operação sensível e se teve sucesso.

**Procedimento de resposta (a formalizar pela TUB):**

| Fase | Ação | Responsável |
|---|---|---|
| 1. Deteção | Alerta automático ou consulta a `api_access_log`/`audit_log` | Operação / SOC |
| 2. Triagem | Classificar severidade e impacto (dados pessoais? serviço essencial?) | Resp. segurança |
| 3. Contenção | Revogar sessões/credenciais no Keycloak, rotacionar API key, bloquear IP no Nginx | Operação |
| 4. Notificação | **Alerta precoce ao CSIRT em 24h**; **notificação completa em 72h** (NIS2 Art. 23.º). Se houver dados pessoais, **notificar a CNPD em 72h** (Art. 33.º RGPD) | Resp. segurança / DPO |
| 5. Erradicação e recuperação | Repor a partir de backups (quando existirem, §3.6) | Operação |
| 6. Lições aprendidas | Relatório final ao CSIRT (até 1 mês) e atualização do plano | Resp. segurança |

> A integração com o CSIRT nacional e o registo como entidade essencial/importante são ação da TUB.

### 3.5 Registo de testes de penetração e auditorias técnicas (template)

| Data | Tipo | Âmbito | Executante | Resultado / nº findings | Estado |
|---|---|---|---|---|---|
| (a agendar) | Pen-test externo (caixa preta) | API + frontend + auth | Entidade certificada (TUB) | - | Por executar |
| (a agendar) | Auditoria de configuração | Nginx, Keycloak, Docker, MQTT | Interno/externo | - | Por executar |
| Sprint -1 (interno) | Auditoria adversarial de código (SEC-1..SEC-14) | Backend + infra | Equipa do projeto | Findings corrigidos (ver Anexo A do PLANO) | Concluído |

### 3.6 Continuidade de negócio e recuperação (BCP/DRP)

**Estado atual:** lacuna assumida. Não existem backups automáticos nem alta disponibilidade; a plataforma corre single-node em Docker Compose.

**Plano (Sprint 8a do PLANO):**
- [ ] Backups automatizados (DW PostgreSQL, Keycloak DB, MongoDB/Orion, config NiFi) com retenção 7d/6m/1a, armazenados em Azure Blob com versionamento (WORM via lifecycle).
- [ ] WAL archiving em PostgreSQL para point-in-time recovery (`wal_level=replica`, `archive_command`).
- [ ] Runbook de restore documentado e testado mensalmente.
- [ ] Objetivos: **RTO < 1h, RPO < 15min**.
- [ ] Liveness/readiness probes e monitorização Prometheus + Grafana.

**Limitação documentada:** sem HA (nó único). A recuperação depende de re-provisionamento do host e restauro dos volumes a partir do backup externo.

---

## 4. Auditoria de Segurança e Compliance

### 4.1 Como auditar acessos, logs e permissões

**Fontes de verdade:**
- `api_access_log` (V29): toda a chamada HTTP (exceto `/actuator`, estáticos e handshake WebSocket), com IP real extraído de `X-Forwarded-For` (atrás do Nginx).
- `audit_log` (V12): operações sensíveis anotadas com `@LogActivity` (username do `preferred_username` do JWT, classe, método, sucesso/erro).
- Keycloak: eventos de login, alterações de password e MFA no realm `pgu-realm`.

**Consultas-tipo de auditoria (RBAC e investigação):**
- "Quem chamou que endpoint e quando?" → `api_access_log` filtrado por `username`/`path`/janela temporal (índices dedicados).
- "Que operações de gestão correu o utilizador X?" → `audit_log` por `username`.
- "Picos de 4xx/5xx (abuso/erros)?" → índice parcial `status >= 400`.
- "Quem tem acesso a quê?" → matchers de `SecurityConfig` (mapa role→endpoint) cruzado com roles atribuídas no Keycloak.

### 4.2 Revisão Zero Trust (mapa das redes)

Princípio: nenhum serviço fala com outro fora da sua rede dedicada; o backend é o único membro de várias redes e atua como ponto de mediação.

| Rede Docker | Serviços | Propósito |
|---|---|---|
| `mqtt_net` | Mosquitto, NiFi, backend | Telemetria IoT (auth + ACL) |
| `etl_net` | NiFi, Orion, backend | Pipeline ETL e NGSI-LD |
| `dw_net` | PostgreSQL/PostGIS, backend | Data warehouse |
| `orion_db_net` | MongoDB, Orion | Persistência do context broker |
| `auth_net` | Keycloak, backend | Identidade |
| `tools_db_net` | ToolsDB, Metabase | BI |
| `osrm_net` | OSRM, backend | Routing |
| `storage_net` | MinIO, Mailpit, backend | Objetos (exports/anexos) e email |
| `ai_net` | Ollama, backend | IA on-premises **sem internet** |

Controlos Zero Trust complementares: autenticação em cada hop (JWT no HTTP e no WebSocket; credenciais MQTT; API key timing-safe para serviços máquina-a-máquina), sessões STATELESS, e princípio do menor privilégio nas ACLs MQTT e nos matchers RBAC.

### 4.3 Mapeamento a controlos ISO/IEC 27001:2022 (Anexo A)

| Controlo Anexo A | Implementação na PGU | Estado |
|---|---|---|
| A.5.15 Controlo de acessos | RBAC Keycloak + matchers `SecurityConfig` | Implementado |
| A.5.17 Informação de autenticação | Passwords temporárias + MFA TOTP | Implementado |
| A.8.5 Autenticação segura | JWT + MFA + API key timing-safe | Implementado |
| A.8.16 Atividades de monitorização | `audit_log` + `api_access_log` + alertas | Implementado |
| A.8.20 Segurança de redes | Micro-segmentação Docker (§4.2) | Implementado |
| A.8.24 Uso de criptografia | TLS 1.2/1.3, JWT, hashing pseudo-id | Implementado |
| A.8.23 Filtragem web / cabeçalhos | CSP, HSTS, X-Frame-Options no Nginx | Implementado |
| A.8.26 Requisitos de segurança das aplicações | Erros tipados, validação, rate limiting | Implementado |
| A.8.13 Backup de informação | Backups | **Lacuna** (Sprint 8a) |
| A.5.7 Threat intelligence / A.5.30 prontidão TIC | BCP/DRP | **Lacuna** (Sprint 8a) |

### 4.4 Evidências de conformidade a anexar (checklist)

- [ ] Excertos de `SecurityConfig` (matriz role→endpoint).
- [ ] `acl.conf` e `mosquitto.conf` (`allow_anonymous false`).
- [ ] `nginx.conf.template` (headers, TLS, rate limit).
- [ ] `pgu-realm-realm.json` (otpPolicy, requiredActions, roles).
- [ ] Esquema e amostra de `audit_log` e `api_access_log`.
- [ ] Diagrama de redes Docker (§4.2).
- [ ] Relatório de pen-test (quando executado).

---

## 5. Entregáveis e formatos

| Documento | Regulação | Formato | Artefactos máquina | Responsável | Estado |
|---|---|---|---|---|---|
| DPIA | RGPD + Lei 58/2019 | PDF/DOCX | Inventário de fluxos em CSV/JSON (§2.2) | Equipa + DPO (TUB) | Fundação pronta (§2) |
| Registo Art. 30.º | RGPD | DOCX/PDF | Tabela bases legais (CSV/JSON) | TUB (responsável) | Fundação pronta (§2.3) |
| Plano de gestão de risco | NIS2 | PDF/DOCX | Matriz de risco (CSV) | Equipa | Fundação pronta (§3.1/§3.2) |
| Relatório de conformidade NIS2 | NIS2 | PDF/DOCX | Matriz mapeamento (CSV/JSON) | Equipa | Fundação pronta (§3.3) |
| Plano CSIRT / resposta a incidentes | NIS2 | PDF/DOCX | Runbook (Markdown) | TUB + equipa | Fundação pronta (§3.4) |
| Registo de pen-tests e auditorias | NIS2/ISO | PDF + tabela | CSV de findings | TUB | Template (§3.5) |
| BCP/DRP + Plano de Backups | NIS2 | PDF/DOCX | `pg_backup.sh`, política WORM (YAML) | Equipa | Planeado (Sprint 8a) |
| Relatório de auditoria de segurança | NIS2/RGPD/ISO | PDF/DOCX | Queries de auditoria (SQL) | Equipa | Fundação pronta (§4) |

---

## 6. Lacunas conhecidas e recomendações

Honestidade sobre o que falta (nada aqui é apresentado como pronto quando não está):

| Lacuna | Impacto | Recomendação | Quando |
|---|---|---|---|
| **Backups automáticos** (R.BAC.01-09) | Alto (perda de dados) | Implementar `pg_backup.sh` + WAL archiving + Azure Blob WORM; testar restore mensal | Sprint 8a |
| **Pen-test formal** | Médio | Contratar entidade externa certificada; registar findings (§3.5) | Ação TUB |
| **Alta disponibilidade (HA)** | Médio | Single-node assumido no âmbito; em produção real avaliar réplicas e orquestração | Pós-projeto |
| **SSO Metabase ↔ Keycloak** (R.AN.17) | Médio | Federar Metabase no Keycloak para auditoria unificada (hoje login próprio) | Sprint 8a |
| **Actuator público** | Médio | Restringir `/actuator/**` a `/actuator/health` | Curto prazo |
| **`sslRequired: none`** no realm | Médio | Definir `sslRequired: external` em produção | Curto prazo |
| **Retenção/expurgo de logs e dados pessoais** | Médio | Definir e automatizar prazos (F6/F7, §2.7) | Curto prazo |
| **Parecer formal do DPO + registo CNPD/CSIRT** | Alto (legal) | Executar fora do âmbito académico | Ação TUB |
| **CSP com `unsafe-inline`/`unsafe-eval`** | Baixo | Endurecer com nonces/hashes | Médio prazo |

---

### Apêndice: índice de evidências no código

| Tema | Ficheiro |
|---|---|
| RBAC / matchers / JWT | `pgu/src/main/java/dai/tub/pgu/config/SecurityConfig.java` |
| API key timing-safe | `pgu/src/main/java/dai/tub/pgu/config/InternalApiKeyFilter.java` |
| WebSocket JWT (STOMP) | `pgu/src/main/java/dai/tub/pgu/config/WebSocketSecurityConfig.java` |
| Erros tipados | `pgu/src/main/java/dai/tub/pgu/config/GlobalExceptionHandler.java` |
| Auditoria AOP | `pgu/src/main/java/dai/tub/pgu/audit/AuditAspect.java`, `LogActivity.java`, `model/AuditLog.java` |
| Audit de acessos HTTP | `pgu/src/main/java/dai/tub/pgu/audit/ApiAccessLogFilter.java`, migração `V29__api_access_log.sql` |
| Tabela audit_log | migração `V12__create_audit_log.sql` |
| Hardening HTTP / TLS | `pgu-web/nginx.conf.template` |
| Segmentação de redes | `docker-compose.yml` (bloco `networks:`) |
| Identidade / MFA / roles | `keycloak/pgu-realm-realm.json` |
| Autenticação MQTT | `mosquitto/config/mosquitto.conf`, `acl.conf` |
| Modelo de bilhética / DPIA | `PLANO_ITERACAO.md` §5.1 |
| IA on-premises isolada | `PLANO_ITERACAO.md` §5.2 |
