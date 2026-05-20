
CREATE TABLE drivers (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    mechanographic_number VARCHAR(20) NOT NULL UNIQUE,
    phone_number VARCHAR(15),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Criar a tabela de associação ativa (Motorista <-> Autocarro)
-- Isto permite saber em tempo real que motorista está a conduzir que veículo
CREATE TABLE driver_bus_assignments (
    id BIGSERIAL PRIMARY KEY,
    driver_id BIGINT NOT NULL,
    bus_id VARCHAR(50) NOT NULL, -- Alinha com o tipo do teu busId (String ou Long)
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unassigned_at TIMESTAMP WITH TIME ZONE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_assignment_driver FOREIGN KEY (driver_id) REFERENCES drivers(id),
    CONSTRAINT unique_active_driver UNIQUE (driver_id, active), -- Um motorista só pode estar num autocarro ativo de cada vez
    CONSTRAINT unique_active_bus UNIQUE (bus_id, active)        -- Um autocarro só pode ter um motorista ativo de cada vez
);

-- Índices para melhorar a performance das consultas em tempo real
CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_assignments_active ON driver_bus_assignments(bus_id) WHERE active = TRUE;