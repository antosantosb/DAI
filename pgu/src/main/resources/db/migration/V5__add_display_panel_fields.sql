-- Substituir campo 'display' por campos de painel eletronico
ALTER TABLE bus_stops DROP COLUMN IF EXISTS display;
ALTER TABLE bus_stops ADD COLUMN max_buses_display INTEGER NOT NULL DEFAULT 3;
ALTER TABLE bus_stops ADD COLUMN panel_message TEXT;
