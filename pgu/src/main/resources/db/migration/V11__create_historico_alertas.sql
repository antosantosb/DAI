CREATE TABLE historico_alertas (
    id SERIAL PRIMARY KEY,
    data TIMESTAMP NOT NULL DEFAULT NOW(),
    autocarro VARCHAR(50) NOT NULL,
    motivo VARCHAR(255) NOT NULL
);