-- Sprint 2: FUNDACAO de bilhetica (modelo "coroas + tempo" da TUB).
-- Ver PLANO_ITERACAO.md secao 5.1. Esta migracao cria APENAS as tabelas
-- (vazias, exceto o seed do tarifario). O Sprint 5 e que preenche e processa
-- (ingestao real de eventos, calculo de preco, agregacao de transbordos).
--
-- Modelo: a TUB opera 2 coroas (zonas) + validade horaria com transbordo.
-- Compativel com os Smart Data Models Ticket / TransitTrip da FIWARE.

-- ------------------------------------------------------------------
-- stop_zone: mapeia cada paragem a uma coroa (1 = centro alargado, 2 = periferia).
-- Alternativa a uma coluna `coroa` direta em bus_stops; tabela dedicada para
-- nao tocar no schema de bus_stops. Unico por stop_id (cada paragem so tem
-- uma coroa).
-- ------------------------------------------------------------------
CREATE TABLE stop_zone (
    id        BIGSERIAL PRIMARY KEY,
    stop_id   BIGINT    NOT NULL REFERENCES bus_stops(id) ON DELETE CASCADE,
    coroa     SMALLINT  NOT NULL CHECK (coroa IN (1, 2)),   -- 1 = centro alargado, 2 = periferia
    CONSTRAINT uq_stop_zone_stop UNIQUE (stop_id)
);

CREATE INDEX idx_stop_zone_coroa ON stop_zone(coroa);

-- ------------------------------------------------------------------
-- ticket: titulo de transporte (instancia emitida pela TUB, ingerida pela PGU).
-- A PGU nao emite titulos; apenas regista/monitoriza. O cartao e' sempre
-- pseudonimizado (card_pseudo_id = SHA-256(cardReal + salt)); NULL no bordo
-- (numerario, sem identificador).
-- ------------------------------------------------------------------
CREATE TABLE ticket (
    id              BIGSERIAL    PRIMARY KEY,
    tipo            VARCHAR(16)  NOT NULL,        -- CARTAO, BORDO, PASSE, APP
    coroa_scope     SMALLINT     NULL,            -- 1 = uma coroa, 2 = rede geral (duas coroas)
    validity_start  TIMESTAMPTZ  NULL,            -- inicio da janela de validade
    validity_end    TIMESTAMPTZ  NULL,            -- validity_start + 1 hora (transbordo livre)
    card_pseudo_id  VARCHAR(64)  NULL,            -- SHA-256(cardReal + salt); NULL no bordo
    status          VARCHAR(16)  NULL             -- ACTIVE, EXPIRED, CANCELLED, ...
);

-- Lookup por cartao pseudonimizado (so as linhas com cartao associado).
CREATE INDEX idx_ticket_card ON ticket(card_pseudo_id) WHERE card_pseudo_id IS NOT NULL;
CREATE INDEX idx_ticket_tipo ON ticket(tipo);

-- ------------------------------------------------------------------
-- validation_event: evento de validacao (uma linha por evento).
-- event_type: TAP (cartao/bordo, so tap-in) ou CHECK_IN / CHECK_OUT (app).
-- Validacoes do mesmo titulo na mesma hora agregam numa viagem com transbordos
-- (logica do Sprint 5). raw_payload guarda o evento bruto recebido (auditoria).
-- ------------------------------------------------------------------
CREATE TABLE validation_event (
    id            BIGSERIAL    PRIMARY KEY,
    ticket_id     BIGINT       NULL REFERENCES ticket(id) ON DELETE SET NULL,
    event_type    VARCHAR(16)  NOT NULL,          -- TAP, CHECK_IN, CHECK_OUT
    bus_id        VARCHAR(32)  NULL,
    route_id      BIGINT       NULL REFERENCES routes(id) ON DELETE SET NULL,
    stop_id       BIGINT       NULL REFERENCES bus_stops(id) ON DELETE SET NULL,
    location      GEOMETRY(Point, 4326) NULL,
    validated_at  TIMESTAMPTZ  NOT NULL,
    source        VARCHAR(16)  NULL,              -- CARD, BORDO, APP
    raw_payload   JSONB        NULL
);

CREATE INDEX idx_ve_route_time  ON validation_event(route_id, validated_at);
CREATE INDEX idx_ve_ticket_time ON validation_event(ticket_id, validated_at);
CREATE INDEX idx_ve_type_time   ON validation_event(event_type, validated_at);
CREATE INDEX idx_ve_location    ON validation_event USING GIST(location);

-- ------------------------------------------------------------------
-- fare_config: tarifario configuravel (sem precos hardcoded; a TUB ajusta
-- sem alterar codigo). valid_from versiona o tarifario.
-- ------------------------------------------------------------------
CREATE TABLE fare_config (
    id            BIGSERIAL    PRIMARY KEY,
    ticket_type   VARCHAR(16)  NOT NULL,          -- CARTAO, BORDO, PASSE, APP
    coroas        SMALLINT     NOT NULL,          -- 1 ou 2 coroas
    price_cents   INT          NOT NULL,
    valid_from    DATE         NOT NULL,
    CONSTRAINT uq_fare_config UNIQUE (ticket_type, coroas, valid_from)
);

CREATE INDEX idx_fare_config_lookup ON fare_config(ticket_type, coroas);

-- Seed com os precos reais do tarifario TUB 2024:
--   avulso 1 coroa .......... 0,75 EUR (75c)   -> tipo BORDO, 1 coroa
--   avulso rede geral ....... 1,50 EUR (150c)  -> tipo BORDO, 2 coroas
--   passe mensal 1 coroa .... 14,00 EUR (1400c) -> tipo PASSE, 1 coroa
--   passe mensal 2 coroas ... 28,00 EUR (2800c) -> tipo PASSE, 2 coroas
INSERT INTO fare_config (ticket_type, coroas, price_cents, valid_from) VALUES
    ('BORDO', 1,   75, DATE '2024-01-01'),
    ('BORDO', 2,  150, DATE '2024-01-01'),
    ('PASSE', 1, 1400, DATE '2024-01-01'),
    ('PASSE', 2, 2800, DATE '2024-01-01');
