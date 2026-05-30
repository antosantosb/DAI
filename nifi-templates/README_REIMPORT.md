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
