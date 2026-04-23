import { NextResponse } from 'next/server';
import { createClient } from '@insforge/sdk';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Extraemos los nuevos campos que envía el ESP32
    const { temp, hum, ppm, mov_count, mov_percent, alert_level, baseline_ppm, is_emergency } = data;

    // -- Usamos el anonKey para insertar, asegúrate de que RLS permita inserts públicos si es necesario --
    const insforge = createClient({
      baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
      anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
    });

    // -- Insertamos en la nueva tabla tipada en lugar de meter JSON en un campo text --
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
        is_emergency 
      }]);

    if (error) {
      console.error("Error inserting data into sensor_readings:", error);
      return NextResponse.json({ error: "Failed to insert data" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Data logged successfully" });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
