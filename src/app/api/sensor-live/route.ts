import { NextResponse } from 'next/server';
import { createClient } from '@insforge/sdk';

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LIVE] Error procesando request:", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
