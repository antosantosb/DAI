# Arquitetura: Simulacao, Conta Dev, Motoristas e Painel de Bordo

> Documento de referencia para implementacao das features de simulacao controlada,
> role dev, gestao de motoristas e consola de bordo.

---

## 1. Roles do Sistema

| Role          | Acesso                                                                 |
|---------------|------------------------------------------------------------------------|
| `admin`       | Backoffice completo (CRUD paragens, rotas, buses, users, GTFS, etc.)   |
| `funcionario` | Backoffice operacional (ver dados, ativar/parar buses, ver dashboards) |
| `dev`         | Tudo do admin + controlos de simulacao nos autocarros ativos            |
| `motorista`   | Apenas painel de bordo (`/bordo/{driverId}`)                           |

### Conta dev
- Existe **apenas uma** no sistema, criada no Keycloak realm.
- Tem acesso a **tudo** que o admin tem.
- Feature extra: na aba **Autocarros** do backoffice, vê botoes adicionais em cada bus ativo:
  - **Simular Atraso** — envia comando ao simulator.py para abrandar/parar o bus
  - **Simular Bateria Baixa** — envia comando para drenar bateria rapidamente
  - **Simular Outros** — velocidade anormal, excesso de passageiros, etc.
- Estes botoes **nao existem** para admin/funcionario — sao exclusivos do dev.

---

## 2. Simulador (simulator.py)

### Estado Atual
- Container proprio com Python
- Busca buses ativos e rotas do backend via REST
- Move buses pelas paragens usando segmentos OSRM
- Envia telemetria via MQTT (`tub/telemetry`) a cada 1s
- Backend recebe via NiFi e persiste + broadcast WebSocket

### Alteracoes Necessarias

#### 2.1 Novos campos na telemetria
O payload MQTT passa a incluir:
```json
{
  "id_veiculo": "TUB-001",
  "velocidade_atual": 32.5,
  "lat": 41.5503,
  "lon": -8.4200,
  "passageiros": 15,
  "estado": "active",
  "proxima_paragem": "Largo do Paco",
  "paragens_restantes": 5,
  "timestamp_leitura": "2026-05-19T14:32:00Z",
  "bateria_pct": 78,
  "atraso_minutos": 0
}
```

**Novos campos:**
- `bateria_pct` (int 0-100) — simulada automaticamente, desce com km percorridos
- `atraso_minutos` (int) — calculado pelo backend comparando posicao vs horario programado (stop_schedule)

#### 2.2 Bateria simulada
- Inicia a 100% quando o bus e ativado
- Desce ~1% por cada 2-3 km percorridos (variacao aleatoria)
- Ao chegar a 0%, o bus para automaticamente (status → STOPPED)
- O dev pode forcar bateria baixa via comando

#### 2.3 Canal de comandos (dev → simulador)
O simulador subscreve um topico MQTT adicional: `tub/simulation/commands`

Formato dos comandos:
```json
{
  "busId": "TUB-001",
  "command": "simulate_delay",
  "params": { "minutes": 10 }
}
```

**Comandos suportados:**
| Comando             | Efeito no simulador                                        |
|---------------------|------------------------------------------------------------|
| `simulate_delay`    | Bus para durante X minutos ou abranda para velocidade minima |
| `cancel_delay`      | Cancela atraso forçado, bus retoma velocidade normal         |
| `set_battery`       | Forca bateria para valor especifico (ex: 5%)                |
| `simulate_speed`    | Altera velocidade do bus (lento, rapido, parado)            |
| `set_passengers`    | Forca contagem de passageiros (ex: overcrowding)            |

O **backend** publica neste topico quando o dev clica nos botoes.
O **simulador** recebe e ajusta o comportamento do bus correspondente.

---

## 3. Detecao Automatica de Atrasos

O atraso **nao e reportado pelo motorista** — e calculado automaticamente pelo backend.

### Logica
1. O backend sabe a que horas o bus **deveria** estar em cada paragem (tabela `stop_schedule`)
2. A telemetria diz em que paragem o bus esta e a que horas
3. `atraso = hora_atual - hora_programada_para_paragem_atual`
4. Se `atraso > threshold` (ex: 3 min), o bus e marcado como atrasado

### Onde calcular
- No `TelemetryService` ao receber cada telemetria
- Ou no `StopPanelService` quando consultado
- O campo `delay_minutes` na tabela `buses` e atualizado periodicamente

### Visualizacao
- **Backoffice (Autocarros):** badge de atraso no card do bus ("+ 8 min")
- **Painel de bordo:** campo "Desvio" com +/- minutos (visivel no mockup)
- **Mapa ao vivo:** cor diferente para buses atrasados

---

## 4. Aba Motoristas (Backoffice)

### Localizacao
- Rota: `/backoffice/drivers`
- Menu lateral: seccao "Operacoes" ou "Gestao"
- Acessivel por: admin, funcionario, dev

### Funcionalidades (baseado no mockup UC07-backoffice-drivers.html)

#### 4.1 CRUD Motoristas
- **Criar** motorista: nome, codigo (MOT-XXX), tipo de carta (D, D1, D1+D), contacto, data inicio
- **Editar** dados do motorista
- **Desativar/Reativar** motorista (soft delete via status)
- **Pesquisa e filtros:** Todos, Com Autocarro, Sem Autocarro, Em Servico

#### 4.2 Atribuicao Motorista ↔ Autocarro
- Cada motorista pode estar atribuido a **um** autocarro parado
- Botao "Atribuir" nos motoristas sem autocarro — mostra select com buses parados disponiveis
- Ao atribuir, o motorista fica "Em Servico" e o bus fica associado
- Para desassociar, o bus tem de estar parado

#### 4.3 Ver Painel de Bordo
- Botao "Consola" em motoristas com autocarro atribuido
- Abre o painel de bordo (`/bordo/{driverId}`) numa nova tab
- Util para o admin verificar o que o motorista ve

#### 4.4 Chat com Motorista
- Botao "Mensagem" abre painel de chat no backoffice
- Chat bidirecional em tempo real (WebSocket)
- Mensagens persistidas na BD para historico
- Alertas do motorista (avaria, emergencia) aparecem como toasts no backoffice

#### 4.5 Alertas de Motoristas
- Painel lateral (ou toasts) com alertas recentes dos motoristas
- Tipos: Avaria reportada, Atraso sinalizado, Emergencia
- Cada alerta mostra: tipo, mensagem, motorista, bus, linha, tempo

---

## 5. Painel de Bordo do Motorista

### Acesso
- URL: `/bordo/{driverId}`
- **Autenticacao:** login do motorista (role `motorista` no Keycloak)
- Otimizado para tablet (landscape)
- Nao faz parte do layout do backoffice — e uma app separada

### Layout (baseado no mockup UC07-consola-bordo.html)

#### 5.1 Barra Superior
- Avatar + nome do motorista
- Codigo motorista + codigo bus (ex: "MOT-001 . BUS-042")
- Hora atual
- Indicador de conexao (online/offline)

#### 5.2 Painel Esquerdo — Viagem Atual
- **Linha e destino:** "Linha 43 — Braga Centro → Gualtar"
- **Stats da viagem:**
  - Paragens (ex: 12/18)
  - Chegada estimada (ex: ~8 min)
  - Desvio/atraso (ex: +3 min) — calculado automaticamente
- **Proxima paragem:** nome, ETA, distancia, barra de progresso

#### 5.3 Mapa em Tempo Real
- Mapa Leaflet com a rota completa do bus desenhada (polyline)
- Marcador animado com a posicao atual do bus (atualizado via WebSocket)
- Paragens da rota marcadas no mapa (icones de paragem)
- Proxima paragem destacada (cor diferente / pulsar)
- Equivalente ao Livemap quando se faz focus num autocarro
- Ocupa a zona central/inferior do painel esquerdo, abaixo das stats da viagem
- Zoom auto-ajustado para mostrar a posicao atual + proxima paragem

#### 5.4 Botoes de Reporte
"Reportar ao Centro de Controlo":
- **Avaria** — problema mecanico (envia alerta ao backoffice)
- **Atraso** — sinalizar demora manualmente (complementa a detecao automatica)
- **Emergencia** — alerta urgente
- **Outro** — mensagem livre

Ao clicar qualquer botao, abre modal de confirmacao/detalhe e envia via WebSocket.

#### 5.5 Painel Direito — Chat
- Mensagens do "Centro de Controlo" (incoming)
- Mensagens do motorista (outgoing)
- Status de entrega (entregue/lido)
- Mensagens de sistema (alertas, notificacoes)
- Campo de input + botao enviar

---

## 6. Campos Novos no Bus

| Campo           | Tipo    | Default | Descricao                                     |
|-----------------|---------|---------|-----------------------------------------------|
| `battery_pct`   | INTEGER | 100     | Percentagem de bateria (0-100)                |
| `delay_minutes` | INTEGER | 0       | Atraso em minutos (negativo = adiantado)      |
| `breakdown_pct` | DOUBLE  | 0.0     | Prob. de avaria simulada (0.0-100.0)          |

Estes campos sao atualizados por:
- `battery_pct` — pelo simulador (via telemetria) + override do dev
- `delay_minutes` — calculado automaticamente pelo backend
- `breakdown_pct` — campo de simulacao controlado pelo dev

---

## 7. Modelo de Dados Novo

### Tabela `drivers` (nova)
| Campo          | Tipo         | Descricao                              |
|----------------|--------------|----------------------------------------|
| id             | BIGSERIAL PK | ID                                     |
| driver_code    | VARCHAR(20)  | Codigo unico (MOT-001)                 |
| name           | VARCHAR(100) | Nome completo                          |
| license_type   | VARCHAR(20)  | Tipo de carta (D, D1, D1+D)            |
| phone          | VARCHAR(20)  | Contacto telefonico                    |
| email          | VARCHAR(100) | Email (opcional)                       |
| status         | VARCHAR(20)  | ACTIVE, INACTIVE                       |
| bus_id         | BIGINT FK    | Autocarro atribuido (nullable)         |
| keycloak_id    | VARCHAR(100) | ID do user no Keycloak                 |
| hired_at       | DATE         | Data de inicio                         |
| created_at     | TIMESTAMPTZ  | Data de criacao do registo             |

### Tabela `driver_messages` (nova)
| Campo       | Tipo         | Descricao                                  |
|-------------|--------------|-------------------------------------------|
| id          | BIGSERIAL PK | ID                                        |
| driver_id   | BIGINT FK    | Motorista                                 |
| sender_type | VARCHAR(20)  | DRIVER, BACKOFFICE, SYSTEM                |
| sender_name | VARCHAR(100) | Nome de quem enviou                       |
| content     | TEXT         | Conteudo da mensagem                      |
| msg_type    | VARCHAR(20)  | TEXT, AVARIA, ATRASO, EMERGENCIA, OUTRO   |
| read_at     | TIMESTAMPTZ  | Quando foi lida (null = nao lida)         |
| created_at  | TIMESTAMPTZ  | Timestamp                                 |

---

## 8. Fluxo de Comunicacao

```
┌─────────────┐     MQTT commands      ┌──────────────┐
│  Backoffice  │ ──────────────────────→│ simulator.py │
│  (dev role)  │  tub/simulation/cmds   │              │
└──────┬───────┘                        └──────┬───────┘
       │                                       │
       │ REST API                               │ MQTT telemetria
       │                                       │ tub/telemetry
       ▼                                       ▼
┌──────────────┐                        ┌──────────────┐
│ Spring Boot  │ ◄──────────────────────│    NiFi      │
│   Backend    │    POST /telemetry     │              │
└──────┬───────┘                        └──────────────┘
       │
       │ WebSocket /topic/telemetry
       │ WebSocket /topic/driver-messages
       ▼
┌──────────────┐         ┌──────────────┐
│  Backoffice  │         │ Painel Bordo │
│  (todos)     │         │ (motorista)  │
└──────────────┘         └──────────────┘
```

### Fluxo: Dev simula atraso
1. Dev clica "Simular Atraso" no bus TUB-005 (backoffice)
2. Backend publica MQTT: `tub/simulation/commands` → `{ busId: "TUB-005", command: "simulate_delay", params: { minutes: 10 } }`
3. Simulator.py recebe, para o bus TUB-005 durante 10 min
4. Telemetria continua a ser enviada (bus parado)
5. Backend calcula atraso: `hora_atual - hora_programada > threshold` → `delay_minutes = +10`
6. Backoffice mostra badge "+10 min" no card do bus
7. Painel de bordo mostra "Desvio: +10 min"

### Fluxo: Motorista reporta avaria
1. Motorista clica "Avaria" no painel de bordo
2. WebSocket envia mensagem tipo AVARIA ao backend
3. Backend persiste em `driver_messages` e broadcast para backoffice
4. Backoffice recebe toast: "Avaria reportada — Manuel Silva . BUS-042 . Linha 43"
5. Admin pode responder via chat

---

## 9. Aba Horarios (Backoffice)

### Localizacao
- Rota: `/backoffice/schedules`
- Menu lateral: seccao "Operacoes", ao lado de Rotas/Paragens
- Acessivel por: admin, funcionario, dev

### Visao Geral
A aba de horarios permite visualizar, editar e gerir os stop_times importados via GTFS.
Os dados vem da tabela `stop_schedule` (populada pelo import GTFS) mas podem ser
ajustados manualmente pelo operador.

### Layout da Pagina

#### 9.1 Seletor de Rota (topo)
- Dropdown/combobox com todas as rotas do sistema
- Ao selecionar uma rota, carrega a tabela de horarios dessa rota
- Mostra info resumo: nome da rota, n. de paragens, n. de viagens (trips distintos)
- Botao "+ Adicionar Viagem" (criar trip manual)

#### 9.2 Filtros
- **Direcao:** Ida (direction_id=0) / Volta (direction_id=1) / Ambas
- **Servico:** filtro por service_id (WEEKDAY, SATURDAY, SUNDAY, etc.)
- **Pesquisa:** filtrar por nome de paragem

#### 9.3 Tabela de Horarios (vista principal)
Formato classico de tabela de horarios de transporte publico:

| Paragem            | Viagem 1 | Viagem 2 | Viagem 3 | ... |
|--------------------|----------|----------|----------|-----|
| Braga Centro       | 08:00    | 09:00    | 10:15    |     |
| Largo do Paco      | 08:05    | 09:05    | 10:20    |     |
| Av. da Liberdade   | 08:12    | 09:12    | 10:27    |     |
| Universidade       | 08:25    | 09:25    | 10:40    |     |

- **Linhas** = paragens (ordenadas por stop_sequence)
- **Colunas** = viagens/trips (ordenadas por hora de partida da 1a paragem)
- Cada celula mostra `arrival_time` (clicavel para editar)
- Celulas editaveis inline (click → input → blur salva)
- Horarios no formato HH:MM (ocultar segundos por simplicidade)
- Cores alternadas para facilitar leitura

#### 9.4 Edicao de Horarios
- **Editar celula individual:** clicar num horario → campo editavel → Enter/blur para salvar
- **Editar viagem inteira:** botao no header da coluna → modal com todos os horarios da viagem
- **Apagar viagem:** botao no header da coluna → confirmacao → apaga todos os stop_times desse trip
- **Adicionar viagem:** modal com lista de paragens da rota, preencher horarios para cada uma
- **Duplicar viagem:** copiar uma viagem existente e ajustar horarios (offset de +X minutos)

#### 9.5 Vista por Paragem (alternativa)
- Toggle "Ver por paragem" muda a vista
- Selecionar uma paragem → mostra todos os horarios dessa paragem, agrupados por rota
- Tabela: Rota | Direcao | Servico | Horarios (lista horizontal)
- Util para verificar que horarios um passageiro ve numa paragem especifica

#### 9.6 Acoes em Bulk
- **Importar horarios:** redireciona para aba GTFS (upload de ZIP)
- **Exportar horarios:** CSV/PDF da rota selecionada (para afixar em paragens)
- **Limpar horarios de uma rota:** apaga todos os stop_times (confirmacao dupla)

### Endpoints REST utilizados
| Metodo | Endpoint                                        | Descricao                              |
|--------|--------------------------------------------------|----------------------------------------|
| GET    | `/api/v1/gtfs/schedules/route/{routeId}`         | Todos os horarios de uma rota          |
| GET    | `/api/v1/gtfs/schedules/stop/{stopId}`           | Horarios de uma paragem (todas rotas)  |
| GET    | `/api/v1/gtfs/schedules/stop/{sId}/route/{rId}`  | Horarios paragem+rota                  |
| POST   | `/api/v1/gtfs/schedules`                         | Criar horario individual (novo)        |
| PUT    | `/api/v1/gtfs/schedules/{id}`                    | Editar horario existente               |
| DELETE | `/api/v1/gtfs/schedules/{id}`                    | Apagar horario individual              |
| POST   | `/api/v1/gtfs/schedules/trip`                    | Criar viagem completa (novo)           |
| DELETE | `/api/v1/gtfs/schedules/trip/{tripId}`           | Apagar viagem inteira                  |

### Validacoes
- Horarios devem estar em formato valido (HH:MM ou HH:MM:SS)
- arrival_time deve ser >= arrival_time da paragem anterior (ordem cronologica)
- Ao criar viagem, todas as paragens da rota devem ter horario
- Ao editar, nao permitir que um horario fique antes do da paragem anterior

### Edge Cases
- **Rota GTFS sem horarios:** a rota e importada na mesma mas sem entradas em stop_schedule.
  O import regista um warning ("Rota X importada sem horarios"). Na aba Rotas e Horarios
  aparece badge "Sem horarios" para o operador poder adicionar manualmente.
- **Rotas criadas manualmente:** nao tem horarios por defeito — o operador adiciona depois
  pela aba Horarios ou pelo botao "Gerir Horarios" no card da rota.
- **Horarios nao sao obrigatorios** — rotas funcionam sem eles (simulador move buses na mesma,
  mas a detecao de atrasos fica desativada para rotas sem schedule).

---

## 10. Ordem de Implementacao

### Fase A — Horarios (stop_schedule) — Backend ✅ FEITO
- [x] Migration V17 (tabela stop_schedule)
- [x] Entity StopSchedule + Repository + DTO
- [x] GtfsService guarda todos os stop_times
- [x] Endpoints REST para consultar horarios (GET)

### Fase B — Aba Horarios (Backoffice)
- [ ] Endpoints REST de escrita (POST/PUT/DELETE schedules, trip CRUD)
- [ ] Pagina `Schedules.jsx` com seletor de rota
- [ ] Tabela de horarios (paragens x viagens) com edicao inline
- [ ] Vista por paragem (toggle alternativo)
- [ ] Modal de criar/duplicar viagem
- [ ] Validacoes de ordem cronologica
- [ ] Adicionar rota e icone no menu lateral
- [ ] CSS seguindo design system do projeto

### Fase C — Campos do Bus + Conta Dev
- [ ] Migration V18 (battery_pct, delay_minutes, breakdown_pct)
- [ ] Atualizar Bus entity/DTO/service com novos campos
- [ ] Role `dev` no Keycloak realm + SecurityConfig + AuthProvider
- [ ] Botoes de simulacao na aba Autocarros (visivel so para dev)
- [ ] Mostrar bateria, atraso e avaria nos cards dos buses

### Fase D — Simulador Atualizado
- [ ] simulator.py: bateria simulada (desce com km)
- [ ] simulator.py: subscrever `tub/simulation/commands`
- [ ] simulator.py: enviar bateria_pct na telemetria
- [ ] Backend: SimulationController (POST `/api/v1/simulation/command`) publica MQTT
- [ ] Backend: calcular delay_minutes automaticamente (telemetria vs stop_schedule)
- [ ] Frontend: modais de simulacao (escolher tipo, parametros)

### Fase E — Motoristas + Chat
- [ ] Migration: tabelas `drivers` e `driver_messages`
- [ ] Entities, Repositories, DTOs, Services, Controller
- [ ] WebSocket para chat bidirecional (driver ↔ backoffice)
- [ ] Aba "Motoristas" no backoffice (CRUD + assign + chat + alertas)
- [ ] Role `motorista` no Keycloak

### Fase F — Painel de Bordo
- [ ] Rota `/bordo/{driverId}` no frontend (app separada do backoffice)
- [ ] Layout tablet: barra superior, stats viagem, mapa, proxima paragem
- [ ] Mapa Leaflet com rota + posicao em tempo real (WebSocket)
- [ ] Botoes de reporte (avaria, emergencia, outro)
- [ ] Chat integrado com backoffice
- [ ] Autenticacao com role motorista
