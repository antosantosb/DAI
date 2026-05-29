-- Sprint 1 (F0): Entidade Operator e relacao Route -> Operator.
-- Requisito R.IVT.03 (Transmodel/NeTEx-aligned operator entity).
--
-- Modelo deliberadamente minimal e' alinhado com NeTEx Organisation/Operator:
--   code        identificador curto (ex: 'TUB')
--   name        razao social (ex: 'Transportes Urbanos de Braga')
--   tax_id      NIF / VAT number (opcional)
--   country     codigo ISO 3166-1 alpha-2 (ex: 'PT')
--   contact_email canal de contacto institucional

CREATE TABLE operators (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(32)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    tax_id          VARCHAR(32),
    country         VARCHAR(2)   NOT NULL DEFAULT 'PT',
    contact_email   VARCHAR(255),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operators_code ON operators(code);

-- Seed: operador TUB (default para todas as rotas existentes).
INSERT INTO operators (code, name, tax_id, country, contact_email)
VALUES ('TUB', 'Transportes Urbanos de Braga', '500091466', 'PT', 'geral@tub.pt');

-- Relacao Route -> Operator (nullable num primeiro momento para nao quebrar
-- linhas existentes; populamos com o seed acima logo a seguir).
ALTER TABLE routes
    ADD COLUMN operator_id BIGINT REFERENCES operators(id) ON DELETE SET NULL;

CREATE INDEX idx_routes_operator ON routes(operator_id);

-- Associa todas as rotas existentes ao operador TUB.
UPDATE routes SET operator_id = (SELECT id FROM operators WHERE code = 'TUB');
