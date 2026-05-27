-- Sprint 0 (F4 follow-up): garantir que as 5 fontes seed têm owner NULL
-- para herdarem do GlobalConfig (Parâmetros). O V33 fazia UPDATE com
-- WHERE owner = 'Equipa DAI', mas dependendo do estado da DB pode nao
-- ter aplicado. Esta migration faz UPDATE forçado pelo nome.

UPDATE data_source
SET owner = NULL, contacto_email = NULL
WHERE nome IN (
    'Simulador de Telemetria',
    'Apache NiFi',
    'FIWARE Orion',
    'Mosquitto MQTT',
    'GTFS TUB'
);
