-- ============================================================
-- SAFESPACE Dual Channel Migration
-- Executed via InsForge CLI on 2026-04-27
-- ============================================================

-- 1. Tabla para datos en vivo (ESP32 inserta directamente cada 5s)
CREATE TABLE IF NOT EXISTS sensor_live (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  temp REAL,
  hum REAL,
  ppm REAL,
  mov BOOLEAN DEFAULT FALSE,
  baseline_ppm REAL
);

ALTER TABLE sensor_live ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_public_insert_live ON sensor_live FOR INSERT WITH CHECK (true);
CREATE POLICY allow_public_select_live ON sensor_live FOR SELECT USING (true);

-- 2. Columnas enriquecidas para reportes de 60s
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS temp_min REAL;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS temp_max REAL;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS ppm_min REAL;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS ppm_max REAL;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS hum_min REAL;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS hum_max REAL;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS ppm_trend TEXT;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS temp_trend TEXT;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS events TEXT;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS total_samples INTEGER;
