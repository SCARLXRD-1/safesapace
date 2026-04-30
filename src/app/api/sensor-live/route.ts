import { NextResponse } from 'next/server';
import { createClient } from '@insforge/sdk';

// Cooldown para evitar spam (1 minuto = 60000 ms)
const TELEGRAM_COOLDOWN = 60 * 1000;
let lastAlertTime = 0;

async function sendTelegramAlert(message: string) {
  // Las credenciales las tomaremos de variables de entorno para que no queden expuestas en GitHub
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!token || !chatId) {
    console.warn("[LIVE] Telegram Token o Chat ID no configurados.");
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_notification: false // Asegura que el celular suene/vibre
      })
    });
  } catch (error) {
    console.error("[LIVE] Error enviando Telegram:", error);
  }
}

// POST: Recibe dato en vivo del ESP32 cada 5 segundos
// El trigger de DB se encarga de publicarlo por WebSocket al dashboard
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { temp, hum, ppm, mov, baseline_ppm } = data;

    const insforge = createClient({
      baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
      anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
    });

    const { error } = await insforge.database
      .from("sensor_live")
      .insert([{ temp, hum, ppm, mov: mov ?? false, baseline_ppm: baseline_ppm ?? 0 }]);

    if (error) {
      console.error("[LIVE] Error insertando en sensor_live:", error);
      return NextResponse.json({ error: "Failed to insert live data" }, { status: 500 });
    }

    // --- LÓGICA DE ALERTA TELEGRAM ---
    // Convertir ppm a porcentaje (aproximado, asumiendo max 10000)
    const mq2_percent = Math.min(100, Math.round(((ppm ?? 0) / 10000) * 100));
    
    // Umbrales de emergencia
    const isGasHigh = mq2_percent > 40;
    const isMovDetected = mov === true;
    const isTempHigh = (temp ?? 0) >= 35.0; // Calor extremo (ajustable)
    const isHumHigh = (hum ?? 0) >= 75.0;  // Humedad extrema (ajustable)
    
    if (isGasHigh || isMovDetected || isTempHigh || isHumHigh) {
      const now = Date.now();
      // Solo manda mensaje si ha pasado más del tiempo de cooldown
      if (now - lastAlertTime > TELEGRAM_COOLDOWN) {
        lastAlertTime = now;
        
        let alertMessage = `🚨 <b>ALERTA SAFESPACE</b> 🚨\n\n`;
        
        // 1. Indicar la causa de la alerta (priorizando las más graves)
        if (isGasHigh && isMovDetected) {
          alertMessage += `⚠️🏃 <b>¡PELIGRO MÚLTIPLE!</b> Gas Alto y Movimiento.\n\n`;
        } else if (isGasHigh) {
          alertMessage += `⚠️ <b>¡ALERTA DE GAS/HUMO!</b> Nivel peligroso detectado.\n\n`;
        } else if (isMovDetected) {
          alertMessage += `🏃 <b>¡ALERTA DE INTRUSO!</b> Movimiento detectado.\n\n`;
        } else if (isTempHigh) {
          alertMessage += `🔥 <b>¡ALERTA DE TEMPERATURA!</b> Calor extremo detectado.\n\n`;
        } else if (isHumHigh) {
          alertMessage += `💧 <b>¡ALERTA DE HUMEDAD!</b> Humedad inusualmente alta.\n\n`;
        }

        // 2. Mostrar TODOS los datos siempre
        alertMessage += `📊 <b>Estado de los Sensores:</b>\n`;
        alertMessage += `💨 Gas (MQ2): ${mq2_percent}% ${isGasHigh ? '🔴' : '🟢'}\n`;
        alertMessage += `🏃 Movimiento: ${isMovDetected ? 'DETECTADO 🔴' : 'DESPEJADO 🟢'}\n`;
        alertMessage += `🌡️ Temperatura: ${(temp ?? 0).toFixed(1)}°C ${isTempHigh ? '🔴' : '🟢'}\n`;
        alertMessage += `💧 Humedad: ${(hum ?? 0).toFixed(1)}% ${isHumHigh ? '🔴' : '🟢'}\n`;
        
        // No usamos await para que el ESP32 no se quede esperando a Telegram
        sendTelegramAlert(alertMessage);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LIVE] Error procesando request:", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
