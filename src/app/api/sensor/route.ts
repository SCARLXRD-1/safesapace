import { NextResponse } from 'next/server';
import { createClient } from '@insforge/sdk';

async function sendTelegramReport(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        // Los reportes rutinarios de 60s llegarán en silencio para no molestar
        disable_notification: true 
      })
    });
  } catch (error) {
    console.error("[REPORT] Error enviando Telegram:", error);
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Extraemos todos los campos que envía el ESP32 (originales + enriquecidos)
    const { 
      temp, hum, ppm, mov_count, mov_percent, alert_level, baseline_ppm, is_emergency,
      // Campos enriquecidos del reporte
      temp_min, temp_max, ppm_min, ppm_max, hum_min, hum_max,
      ppm_trend, temp_trend, events, total_samples
    } = data;

    const insforge = createClient({
      baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
      anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
    });

    // Insertamos el reporte enriquecido
    const { error } = await insforge.database
      .from("sensor_readings")
      .insert([{ 
        temp, 
        hum, 
        ppm, 
        mov_count, 
        mov_percent, 
        is_alert: alert_level !== 'normal', 
        alert_level, 
        baseline_ppm, 
        is_emergency,
        // Nuevos campos del reporte enriquecido
        temp_min: temp_min ?? null,
        temp_max: temp_max ?? null,
        ppm_min: ppm_min ?? null,
        ppm_max: ppm_max ?? null,
        hum_min: hum_min ?? null,
        hum_max: hum_max ?? null,
        ppm_trend: ppm_trend ?? null,
        temp_trend: temp_trend ?? null,
        events: events ? JSON.stringify(events) : null,
        total_samples: total_samples ?? null,
      }]);

    if (error) {
      console.error("Error inserting data into sensor_readings:", error);
      return NextResponse.json({ error: "Failed to insert data" }, { status: 500 });
    }

    // --- ENVIAR REPORTE DETALLADO A TELEGRAM ---
    let reportMessage = `📝 <b>REPORTE DETALLADO (60s)</b>\n\n`;
    
    reportMessage += `🌡️ <b>TEMPERATURA:</b> ${temp.toFixed(1)}°C\n`;
    reportMessage += `└ <i>Min: ${temp_min ?? temp}°C | Max: ${temp_max ?? temp}°C</i>\n\n`;
    
    reportMessage += `💧 <b>HUMEDAD:</b> ${hum.toFixed(1)}%\n`;
    reportMessage += `└ <i>Min: ${hum_min ?? hum}% | Max: ${hum_max ?? hum}%</i>\n\n`;
    
    reportMessage += `💨 <b>GAS (PPM):</b> ${ppm.toFixed(0)} ppm\n`;
    reportMessage += `└ <i>Rango: ${ppm_min ?? ppm} - ${ppm_max ?? ppm} ppm</i>\n\n`;
    
    reportMessage += `🏃 <b>MOVIMIENTO:</b> ${mov_percent}% de actividad\n\n`;

    // Análisis de Periodo (Lógica similar a la web)
    reportMessage += `✨ <b>ANÁLISIS DEL PERIODO:</b>\n`;
    if ((ppm_max ?? 0) > (baseline_ppm ?? 0) + 100) {
      reportMessage += `• Nivel de gas elevado. Se detectó un pico significativo.\n`;
    } else {
      reportMessage += `• Niveles de gas estables y dentro del rango normal.\n`;
    }
    if (mov_percent > 0) {
      reportMessage += `• Se registró movimiento en el área monitoreada.\n`;
    } else {
      reportMessage += `• Sin presencia o movimiento detectado.\n`;
    }
    reportMessage += `\n`;

    // Timeline de eventos
    if (events && Array.isArray(events) && events.length > 0) {
      reportMessage += `🕒 <b>TIMELINE DE EVENTOS:</b>\n`;
      events.forEach((ev: string) => {
        reportMessage += `📍 ${ev}\n`;
      });
    }

    sendTelegramReport(reportMessage);

    return NextResponse.json({ success: true, message: "Report logged successfully" });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// GET para health check y obtener último reporte
export async function GET() {
  try {
    const insforge = createClient({
      baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
      anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
    });

    const { data, error } = await insforge.database
      .from("sensor_readings")
      .select()
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
    }

    return NextResponse.json({ 
      status: "online",
      latest: data?.[0] ?? null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
