# NiFi: re-importar apos Fase C (Passo 2 - MAIN SENSOR)

## O que mudou na Fase C (Passo 2)

O simulador deixou de reportar apenas "telemetria flat" e passou a reportar como
MAIN SENSOR. Para cada autocarro publica agora, no mesmo topico `tub/telemetry`,
um frame com:

- `sensorId` (o gateway do main sensor atribuido ao autocarro, ex.: `GW-101`);
- `lat`, `lon`, `speed`, `timestamp`;
- `subsensors`: `{ rpm, bateria, km, passageiros{boarded,alighted,onboard}, gps }`,
  cada um com `health` (>= 0.9, saudavel).

O frame mantem TAMBEM os campos legados (`id_veiculo`, `velocidade_atual`,
`entradas`/`saidas`/`ocupacao`, `estado`, `proxima_paragem`, ...) para o ramo
Orion / NGSI-LD continuar a funcionar sem alteracoes.

Alteracoes no flow `pgu_ingestion_telemetry.json`:

1. Ramo backend - processador `InvokeHTTP` (o que faz POST ao Spring Boot):
   o `HTTP URL` mudou de `.../api/v1/telemetry/ingest` para
   `http://spring-boot-backend:8081/api/v1/telemetry/ingest/sensor` (endpoint NOVO
   que recebe o frame keyed por `sensorId`).

2. Ramo backend - processador `JoltTransformJSON` que alimenta esse `InvokeHTTP`:
   a Jolt Specification passou a ser um simples `shift` que seleciona apenas
   `sensorId`, `lat`, `lon`, `speed`, `timestamp` e a sub-arvore `subsensors`
   (descarta os campos legados, que so' servem o ramo Orion). O resultado e'
   EXACTAMENTE o JSON do contrato `/ingest/sensor`.

3. Ramo Orion / NGSI-LD (`JoltTransformJSON` -> `InvokeHTTP` para `orion:1026`):
   NAO mudou. Continua a construir a entidade `Vehicle` a partir dos campos legados.

### Continuidade (livemap nunca vazio)

O backend resolve o autocarro por `vehicle_sensor.gateway -> bus_id`. Para isso, o
simulador garante (de forma idempotente, via REST) que cada autocarro simulado tem
um main sensor com gateway `GW-<codigo>` criado e atribuido, ANTES de publicar:
`GET /api/v1/sensors`, depois `POST /api/v1/sensors` se faltar, depois
`PUT /api/v1/sensors/{id}/assign?busId=...` se estiver livre. Os mesmos autocarros
que ja se moviam continuam a mover-se.

## Passos de re-importacao (pela ordem)

1. Rebuild + restart do backend (endpoint `/ingest/sensor` ja existe do Passo 1,
   mas garante a versao mais recente):
   `docker compose up -d --build spring-boot-backend`

2. No NiFi (UI), parar o process group `pgu_ingestion_telemetry`.

3. Importar a nova versao do flow a partir de
   `nifi-templates/pgu_ingestion_telemetry.json`
   (ou, em alternativa manual: colar a nova `Jolt Specification` no
   `JoltTransformJSON` do ramo backend e mudar o `HTTP URL` do `InvokeHTTP`
   do ramo backend para `.../api/v1/telemetry/ingest/sensor`).

4. Arrancar o process group e confirmar que nao ha filas presas
   (ConsumeMQTT -> Jolt -> InvokeHTTP a 200).

5. Reiniciar o simulador para publicar o novo shape e provisionar os sensores:
   `docker compose restart simulator`
   (nos logs deve aparecer "Main sensor GW-... criado/atribuido").

6. Verificar o livemap: os autocarros continuam a mover-se e o backend recebe os
   frames keyed por `sensorId`.

---

# NiFi: re-importar apos Sprint 2 (Vertical 3.4, APC)

O ficheiro `pgu_ingestion_telemetry.json` foi atualizado no Sprint 2 para a
contagem automatica de passageiros (R.ICP.01 / R.ICP.10).

## O que mudou nos dois JoltTransformJSON

1. Transform para o backend (mapeamento flat): passou a mapear
   `entradas -> boarded`, `saidas -> alighted`, `ocupacao -> onboard`
   (alem dos campos ja existentes).

2. Transform para Orion / NGSI-LD (entidade `Vehicle`): a entidade passou a
   transportar tambem `peopleCount`, `peopleBoarding` e `peopleLeaving` como
   Properties, a partir de `ocupacao`/`entradas`/`saidas`.
   Nota: a entidade NGSI-LD dedicada do Smart Data Model oficial
   `PassengerCount` e' exposta diretamente pelo backend
   (`GET /api/v1/ngsi-ld/passenger-count`), nao pelo NiFi.

## Acao necessaria

E' PRECISO RE-IMPORTAR este template no NiFi para as alteracoes terem efeito:
as definicoes dos processadores Jolt em execucao nao mudam sozinhas a partir do
ficheiro. Importa a nova versao do flow (ou cola as novas Jolt Specifications
nos dois processadores) e reinicia o process group.
