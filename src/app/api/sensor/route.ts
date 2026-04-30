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

    // --- ENVIAR REPORTE A TELEGRAM ---
    // Convertir ppm a porcentaje
    const mq2_percent = Math.min(100, Math.round(((ppm ?? 0) / 10000) * 100));
    const mq2_max_percent = Math.min(100, Math.round(((ppm_max ?? 0) / 10000) * 100));

    let reportMessage = `📝 <b>REPORTE DE RUTINA (60s)</b>\n\n`;
    reportMessage += `<b>Promedios del último minuto:</b>\n`;
    reportMessage += `💨 Gas (MQ2): ${mq2_percent}%\n`;
    reportMessage += `🌡️ Temperatura: ${(temp ?? 0).toFixed(1)}°C\n`;
    reportMessage += `💧 Humedad: ${(hum ?? 0).toFixed(1)}%\n`;
    reportMessage += `🏃 Actividad (Movimiento): ${mov_percent ?? 0}%\n\n`;
    
    reportMessage += `<b>Picos Máximos detectados:</b>\n`;
    reportMessage += `📈 Gas Max: ${mq2_max_percent}%\n`;
    reportMessage += `🔥 Temp Max: ${(temp_max ?? 0).toFixed(1)}°C\n`;

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
