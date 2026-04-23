"use client";

import { useEffect, useState, useMemo } from "react";
import { insforge } from "./insforge-client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { BellRing, Activity, AlertTriangle, WifiOff, Wifi } from "lucide-react";
import Image from "next/image";

// -- Definición tipada de la nueva tabla de base de datos --
interface SensorData {
  id: string;
  created_at: string;
  temp: number;
  hum: number;
  ppm: number;
  mov_count: number;
  mov_percent: number;
  is_alert: boolean;
  alert_level: string;
  baseline_ppm: number;
  is_emergency: boolean;
}

export function Dashboard({ dashboardUrl }: { dashboardUrl: string }) {
  const [data, setData] = useState<SensorData[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [toast, setToast] = useState<{ message: string; visible: boolean; isCritical: boolean; title?: string }>({ message: "", visible: false, isCritical: false });
  const [isOffline, setIsOffline] = useState(false);

  // Guardamos el ID del último registro procesado para saber cuándo llega uno nuevo
  const [lastProcessedId, setLastProcessedId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    
    // -- El ESP32 envía cada 60s, nosotros hacemos polling cada 5s para no saturar --
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // -- Evaluar si el dispositivo está offline --
  useEffect(() => {
    if (data.length > 0) {
      const latestData = data[0];
      const latestTime = new Date(latestData.created_at).getTime();
      const now = Date.now();
      
      // Si han pasado más de 2.5 minutos (150,000 ms) sin datos, asumimos que se desconectó
      // (Dado que el ESP32 envía cada 1 minuto)
      if (now - latestTime > 150000) {
        setIsOffline(true);
      } else {
        setIsOffline(false);
      }

      // -- Lógica de notificaciones --
      if (latestData.id !== lastProcessedId) {
        setLastProcessedId(latestData.id);
        
        // Si es un dato nuevo y es emergencia, toast rojo inmediato
        if (latestData.is_emergency) {
          let msg = `¡PELIGRO! Temp: ${latestData.temp}°C, Gas: ${latestData.ppm}ppm`;
          setToast({ message: msg, visible: true, isCritical: true, title: "¡ALERTA DE EMERGENCIA!" });
          setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 10000);
        } else if (latestData.alert_level === 'warning') {
          let msg = `Advertencia - Temp: ${latestData.temp}°C, Gas: ${latestData.ppm}ppm`;
          setToast({ message: msg, visible: true, isCritical: false, title: "Reporte de Riesgo Medio" });
          setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 8000);
        }
      }
    }
  }, [data, lastProcessedId]);

  async function fetchData() {
    // -- Ahora leemos directamente de la tabla tipada, sin parseos raros de JSON --
    const { data: rawData, error } = await insforge.database
      .from("sensor_readings")
      .select()
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!error && rawData) {
      setData(rawData as SensorData[]);
    }
  }

  // Filter logic
  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (!startDate && !endDate) return true;
      const dTime = new Date(d.created_at).getTime();
      const sTime = startDate ? new Date(startDate).getTime() : 0;
      const eTime = endDate ? new Date(endDate).getTime() : Infinity;
      return dTime >= sTime && dTime <= eTime;
    });
  }, [data, startDate, endDate]);

  const latest = data[0] || { temp: 0, hum: 0, ppm: 0, mov_percent: 0, baseline_ppm: 0 };

  // Helpers para la UI con colores basados en la nueva paleta y tailwind
  const getTempStatus = (t: number) => {
    if (t < 10 || t > 40) return { color: "text-[#EF4444]", text: "TEMP. CRÍTICA", bg: "bg-[#EF4444]" };
    if (t < 15 || t > 35) return { color: "text-[#F59E0B]", text: "TEMP. ANORMAL", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "TEMPERATURA IDEAL", bg: "bg-[#22C55E]" };
  };
  
  const getHumStatus = (h: number) => {
    if (h < 20 || h > 70) return { color: "text-[#EF4444]", text: "HUMEDAD CRÍTICA", bg: "bg-[#EF4444]" };
    if (h < 30 || h > 60) return { color: "text-[#F59E0B]", text: "HUMEDAD ANORMAL", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "HUMEDAD ÓPTIMA", bg: "bg-[#22C55E]" };
  };

  const getGasStatus = (g: number, base: number) => {
    if (g > base * 3 || g > 1000) return { color: "text-[#EF4444]", text: "ALERTA MÁXIMA", bg: "bg-[#EF4444]" };
    if (g > base * 1.5 || g > 300) return { color: "text-[#F59E0B]", text: "RIESGO MEDIO", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "NIVEL SEGURO", bg: "bg-[#22C55E]" };
  };

  const getMovStatus = (p: number) => {
    if (p > 50) return { color: "text-[#EF4444]", text: "ALTA ACTIVIDAD", bg: "bg-[#EF4444]" };
    if (p > 10) return { color: "text-[#F59E0B]", text: "PRESENCIA MODERADA", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "ÁREA DESPEJADA", bg: "bg-[#22C55E]" };
  };

  const chartData = [...filteredData].reverse().map(d => ({
    time: format(parseISO(d.created_at), "HH:mm"),
    temp: d.temp,
    hum: d.hum,
    ppm: d.ppm
  }));

  // Render variables to handle the offline dimming effect
  const cardOpacity = isOffline ? "opacity-50 grayscale transition-all duration-1000" : "opacity-100 transition-all duration-1000";

  return (
    <div className="min-h-screen bg-[var(--color-bg-dark)] text-[var(--color-text-main)] p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header con el logo y el gradiente de la marca */}
        <div className="flex flex-col items-center mb-8 pt-4">
          <div className="relative w-24 h-24 mb-4">
            {/* Si tienes el logo, asegúrate de colocarlo en public/logo.png */}
            {/* <Image src="/logo.png" alt="Safespace Logo" fill className="object-contain" /> */}
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight uppercase" style={{
            background: 'linear-gradient(to right, var(--color-primary), var(--color-secondary))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            SAFESPACE
          </h1>
          <p className="text-[var(--color-text-muted)] mt-2 font-medium">Sistema Inteligente de Monitoreo</p>
          
          {/* Badge de estado (Offline / Online) */}
          <div className={`mt-6 px-6 py-2 border rounded-full flex items-center gap-3 transition-colors ${isOffline ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
            {isOffline ? <WifiOff size={18} /> : <Wifi size={18} />}
            <span className="text-[15px] font-bold tracking-wide">
              {isOffline ? "DISPOSITIVO DESCONECTADO" : "SISTEMA EN LÍNEA"}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[var(--color-surface)] border border-black/5 rounded-2xl p-6 shadow-xl max-w-3xl mx-auto">
          <div className="flex flex-wrap gap-4 items-end justify-center">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">Desde</label>
              <input 
                type="datetime-local" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-[var(--color-bg-dark)] border border-black/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">Hasta</label>
              <input 
                type="datetime-local" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-[var(--color-bg-dark)] border border-black/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>
            <button 
              onClick={() => {setStartDate(""); setEndDate("");}}
              className="px-6 py-3 bg-[var(--color-surface-hover)] hover:bg-black/5 rounded-xl text-sm font-medium transition-colors shadow"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto ${cardOpacity}`}>
          
          {/* Temperatura */}
          <div className="bg-[var(--color-surface)] p-6 rounded-3xl border border-[var(--color-primary)]/20 shadow-lg relative overflow-hidden group hover:border-[var(--color-primary)]/50 transition-colors">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Temperatura</span>
              <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] ${getTempStatus(latest.temp).bg}`}></div>
            </div>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-5xl font-extrabold tracking-tighter">{latest.temp?.toFixed(1) || '--'}</span>
              <span className="text-xl text-[var(--color-text-muted)] font-medium">°C</span>
            </div>
            <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-black/5 ${getTempStatus(latest.temp).color}`}>
              {getTempStatus(latest.temp).text}
            </span>
          </div>

          {/* Humedad */}
          <div className="bg-[var(--color-surface)] p-6 rounded-3xl border border-[var(--color-primary)]/20 shadow-lg relative overflow-hidden group hover:border-[var(--color-primary)]/50 transition-colors">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Humedad</span>
              <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] ${getHumStatus(latest.hum).bg}`}></div>
            </div>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-5xl font-extrabold tracking-tighter">{Math.round(latest.hum) || '--'}</span>
              <span className="text-xl text-[var(--color-text-muted)] font-medium">% RH</span>
            </div>
            <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-black/5 ${getHumStatus(latest.hum).color}`}>
              {getHumStatus(latest.hum).text}
            </span>
          </div>

          {/* Gas */}
          <div className="bg-[var(--color-surface)] p-6 rounded-3xl border border-[var(--color-primary)]/20 shadow-lg relative overflow-hidden group hover:border-[var(--color-primary)]/50 transition-colors">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Calidad Aire</span>
              <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] ${getGasStatus(latest.ppm, latest.baseline_ppm).bg}`}></div>
            </div>
            <div className="flex flex-col gap-1 mb-2">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold tracking-tighter">{latest.ppm > 9999 ? '>9k' : Math.round(latest.ppm) || '--'}</span>
                <span className="text-xl text-[var(--color-text-muted)] font-medium">ppm</span>
              </div>
              <span className="text-xs text-[var(--color-text-muted)] font-medium">Baseline: {Math.round(latest.baseline_ppm || 0)} ppm</span>
            </div>
            <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-black/5 ${getGasStatus(latest.ppm, latest.baseline_ppm).color}`}>
              {getGasStatus(latest.ppm, latest.baseline_ppm).text}
            </span>
          </div>

          {/* Movimiento */}
          <div className="bg-[var(--color-surface)] p-6 rounded-3xl border border-[var(--color-primary)]/20 shadow-lg relative overflow-hidden group hover:border-[var(--color-primary)]/50 transition-colors">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Actividad (PIR)</span>
              <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] ${getMovStatus(latest.mov_percent).bg}`}></div>
            </div>
            <div className="flex items-baseline gap-2 mb-4 h-[56px]">
              <span className="text-5xl font-extrabold tracking-tighter">{latest.mov_percent?.toFixed(0) || '0'}</span>
              <span className="text-xl text-[var(--color-text-muted)] font-medium">%</span>
            </div>
            <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-black/5 ${getMovStatus(latest.mov_percent).color}`}>
              {getMovStatus(latest.mov_percent).text}
            </span>
          </div>
        </div>

        {/* Charts Section */}
        <div className="bg-[var(--color-surface)] border border-black/5 rounded-3xl p-6 shadow-xl max-w-7xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-[var(--color-primary)]">
            <Activity size={24} /> Histórico de Monitoreo
          </h2>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                {/* Colores usando la nueva paleta de la marca para las líneas */}
                <Line type="monotone" dataKey="temp" stroke="#E8832A" strokeWidth={3} dot={false} name="Temperatura (°C)" />
                <Line type="monotone" dataKey="hum" stroke="#D4883A" strokeWidth={3} dot={false} name="Humedad (%)" />
                <Line type="monotone" dataKey="ppm" stroke="#C4692E" strokeWidth={3} dot={false} name="Gas (ppm)" />
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" stroke="#A0A0A0" tick={{fill: '#A0A0A0', fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis stroke="#A0A0A0" tick={{fill: '#A0A0A0', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB', borderRadius: '12px', color: '#1A1A1A', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                  itemStyle={{ fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Toast Notifier */}
      {toast.visible && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 ${toast.isCritical ? 'bg-red-600 border-red-500 shadow-[0_10px_40px_rgba(239,68,68,0.5)]' : 'bg-[var(--color-primary)] border-[var(--color-secondary)] shadow-[0_10px_40px_rgba(232,131,42,0.3)]'} border text-white px-6 py-4 rounded-2xl flex items-center gap-4 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300`}>
          <BellRing className={`animate-bounce ${toast.isCritical ? 'text-white' : 'text-white'}`} />
          <div>
            <h4 className="font-bold text-lg">{toast.title}</h4>
            <p className="text-sm opacity-90">{toast.message}</p>
          </div>
          <button onClick={() => setToast(prev => ({...prev, visible: false}))} className="ml-4 p-2 bg-black/20 hover:bg-black/40 rounded-full transition-colors">✕</button>
        </div>
      )}
    </div>
  );
}
