import { NextResponse } from 'next/server';
import { createClient } from '@insforge/sdk';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { temp, hum, ppm, mov } = data;

    // Check if it's an alert
    const isAlert = temp < 15 || temp > 30 || hum < 30 || hum > 60 || ppm > 300 || mov;
    
    // Create a JSON log string
    const payload = JSON.stringify({ temp, hum, ppm, mov, isAlert });

    // Initialize Insforge client with service role key if needed, or anon key
    // We will use anon key for now since the table is public
    const insforge = createClient({
      baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
      anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
    });

    // Insert into todo table as a log
    const { error } = await insforge.database
      .from("todo")
      .insert([{ text: payload }]);

    if (error) {
      console.error("Error inserting data:", error);
      return NextResponse.json({ error: "Failed to insert data" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Data logged successfully" });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
