-- ============================================================
-- SAFESPACE: Realtime WebSocket para datos en vivo
-- Reemplaza polling HTTP por push instantáneo via WebSocket
-- ============================================================

-- 1. Canal Realtime para datos en vivo del sensor
INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('sensor:live', 'Datos de sensores en tiempo real cada 5s', true)
ON CONFLICT DO NOTHING;

-- 2. Trigger: cada INSERT en sensor_live publica al canal WebSocket
CREATE OR REPLACE FUNCTION notify_sensor_live()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.publish(
    'sensor:live',
    'new_reading',
    jsonb_build_object(
      'id', NEW.id,
      'temp', NEW.temp,
      'hum', NEW.hum,
      'ppm', NEW.ppm,
      'mov', NEW.mov,
      'baseline_ppm', NEW.baseline_ppm,
      'created_at', NEW.created_at
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sensor_live_realtime ON sensor_live;
CREATE TRIGGER sensor_live_realtime
  AFTER INSERT ON sensor_live
  FOR EACH ROW
  EXECUTE FUNCTION notify_sensor_live();

-- 3. Limpieza automática: mantener solo últimas 500 filas en sensor_live
--    para evitar que la tabla crezca infinitamente
CREATE OR REPLACE FUNCTION cleanup_sensor_live()
RETURNS TRIGGER AS $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT count(*) INTO row_count FROM sensor_live;
  IF row_count > 600 THEN
    DELETE FROM sensor_live
    WHERE id IN (
      SELECT id FROM sensor_live
      ORDER BY created_at ASC
      LIMIT (row_count - 500)
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sensor_live_cleanup ON sensor_live;
CREATE TRIGGER sensor_live_cleanup
  AFTER INSERT ON sensor_live
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION cleanup_sensor_live();
