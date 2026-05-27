-- Sprint 0 (F4 follow-up): descricoes das fontes de dados mais curtas,
-- com acentuacao portuguesa correta e sem caracteres tipo seta ("->").

UPDATE data_source SET descricao = 'Pipeline ETL.'                          WHERE nome = 'Apache NiFi';
UPDATE data_source SET descricao = 'Context broker NGSI-LD.'                WHERE nome = 'FIWARE Orion';
UPDATE data_source SET descricao = 'Carga periódica do GTFS.'               WHERE nome = 'GTFS TUB';
UPDATE data_source SET descricao = 'Broker MQTT com autenticação por serviço.' WHERE nome = 'Mosquitto MQTT';
UPDATE data_source SET descricao = 'Telemetria de autocarros.'              WHERE nome = 'Simulador de Telemetria';
