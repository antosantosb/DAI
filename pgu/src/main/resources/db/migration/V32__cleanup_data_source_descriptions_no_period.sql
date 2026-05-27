-- Sprint 0 (F4 follow-up): remover ponto final das descricoes (mais limpas em UI).

UPDATE data_source SET descricao = 'Pipeline ETL'                          WHERE nome = 'Apache NiFi';
UPDATE data_source SET descricao = 'Context broker NGSI-LD'                WHERE nome = 'FIWARE Orion';
UPDATE data_source SET descricao = 'Carga periódica do GTFS'               WHERE nome = 'GTFS TUB';
UPDATE data_source SET descricao = 'Broker MQTT com autenticação por serviço' WHERE nome = 'Mosquitto MQTT';
UPDATE data_source SET descricao = 'Telemetria de autocarros'              WHERE nome = 'Simulador de Telemetria';
