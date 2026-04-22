"use client";

import { useEffect, useState, useMemo } from "react";
import { insforge } from "./insforge-client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { Bell, BellRing, Activity, Droplets, Wind, AlertTriangle } from "lucide-react";

interface SensorData {
  id: string;
  created_at: string;
  temp: number;
  hum: number;
  ppm: number;
  mov: boolean;
  isAlert: boolean;
}

export function Dashboard({ dashboardUrl }: { dashboardUrl: string }) {
  const [data, setData] = useState<SensorData[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [toast, setToast] = useState<{ message: string; visible: boolean; isCritical: boolean; title?: string }>({ message: "", visible: false, isCritical: false });
  const [lastAlertTime, setLastAlertTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes

  useEffect(() => {
    fetchData();
    
    // Use polling every 3 seconds to get updates
    const interval = setInterval(fetchData, 3000);

    return () => clearInterval(interval);
  }, []);

  // Timer logic
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Trigger normal report
          if (data.length > 0) {
            const latestData = data[0];
            let msg = `Temp: ${latestData.temp.toFixed(1)}°C | Hum: ${Math.round(latestData.hum)}% | Gas: ${Math.round(latestData.ppm)}ppm | Mov: ${latestData.mov ? 'Sí' : 'No'}`;
            setToast({ message: msg, visible: true, isCritical: false, title: "🔔 Reporte de Sensores" });
            setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 8000);
          }
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [data]);

  // Effect to handle alerts when data changes
  useEffect(() => {
    if (data.length > 0) {
      const latestData = data[0];
      if (latestData.isAlert) {
        const now = Date.now();
        if (now - lastAlertTime > 30000) {
          let msg = `Alerta Detectada! Temp: ${latestData.temp}°C, Gas: ${latestData.ppm}ppm, Mov: ${latestData.mov ? 'Sí' : 'No'}`;
          setToast({ message: msg, visible: true, isCritical: true, title: "¡ALERTA INSTANTÁNEA DE SENSORES!" });
          setLastAlertTime(now);
          setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 8000);
        }
      }
    }
  }, [data]);

  async function fetchData() {
    const { data: rawData, error } = await insforge.database
      .from("todo")
      .select()
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!error && rawData) {
      const parsedData = rawData.map(row => {
        try {
          const parsed = JSON.parse(row.text);
          return {
            id: row.id,
            created_at: row.created_at,
            ...parsed
          };
        } catch (e) {
          return null;
        }
      }).filter(Boolean) as SensorData[];
      
      setData(parsedData);
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

  const latest = data[0] || { temp: 0, hum: 0, ppm: 0, mov: false };

  // Helper for UI colors and texts based on original HTML
  const getTempStatus = (t: number) => {
    if (t < 10 || t > 35) return { color: "text-red-500", text: "TEMP. CRÍTICA", bg: "bg-red-500" };
    if (t < 15 || t > 30) return { color: "text-yellow-500", text: "TEMP. ANORMAL", bg: "bg-yellow-500" };
    return { color: "text-emerald-500", text: "TEMPERATURA IDEAL", bg: "bg-emerald-500" };
  };
  
  const getHumStatus = (h: number) => {
    if (h < 20 || h > 70) return { color: "text-red-500", text: "HUMEDAD CRÍTICA", bg: "bg-red-500" };
    if (h < 30 || h > 60) return { color: "text-yellow-500", text: "HUMEDAD ANORMAL", bg: "bg-yellow-500" };
    return { color: "text-emerald-500", text: "HUMEDAD ÓPTIMA", bg: "bg-emerald-500" };
  };

  const getGasStatus = (g: number) => {
    if (g > 1000) return { color: "text-red-500", text: "ALERTA MÁXIMA", bg: "bg-red-500" };
    if (g > 300) return { color: "text-yellow-500", text: "RIESGO MEDIO", bg: "bg-yellow-500" };
    return { color: "text-emerald-500", text: "NIVEL SEGURO", bg: "bg-emerald-500" };
  };

  const getMovStatus = (m: boolean) => {
    return m 
      ? { color: "text-yellow-500", text: "PRESENCIA DETECTADA", val: "Detectado", bg: "bg-yellow-500" } 
      : { color: "text-emerald-500", text: "ÁREA DESPEJADA", val: "Normal", bg: "bg-emerald-500" };
  };

  // Recharts needs data sorted chronologically
  const chartData = [...filteredData].reverse().map(d => ({
    time: format(parseISO(d.created_at), "HH:mm:ss"),
    temp: d.temp,
    hum: d.hum,
    ppm: d.ppm
  }));

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-6 font-sans" style={{ backgroundImage: 'radial-gradient(circle at top right, #1e293b, transparent 40%), radial-gradient(circle at bottom left, #0f172a, transparent 40%)' }}>
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-4xl font-bold text-sky-400 tracking-widest uppercase">SAFESPACE</h1>
          <p className="text-slate-400 mt-2 font-light">Análisis Ambiental y Seguridad Inteligente</p>
          
          <div className="mt-6 px-6 py-2 bg-sky-400/10 border border-sky-400/30 rounded-full flex items-center gap-3">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-sky-400"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span className="text-[15px] font-medium text-sky-400/90">Siguiente reporte en:</span>
            <span className="text-[15px] font-bold text-sky-400 min-w-[45px]">{formatTime(timeLeft)}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-6 backdrop-blur-md shadow-lg max-w-3xl mx-auto">
          <div className="flex flex-wrap gap-4 items-end justify-center">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Desde</label>
              <input 
                type="datetime-local" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 transition-colors shadow-inner"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Hasta</label>
              <input 
                type="datetime-local" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 transition-colors shadow-inner"
              />
            </div>
            <button 
              onClick={() => {setStartDate(""); setEndDate("");}}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium transition-colors shadow"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {/* Temperatura */}
          <div className="bg-slate-800/40 p-8 rounded-3xl border border-white/5 backdrop-blur-md shadow-lg transition-transform hover:-translate-y-1">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-300">Temperatura</span>
              <div className={`w-3 h-3 rounded-full animate-pulse shadow-[0_0_15px_currentColor] ${getTempStatus(latest.temp).bg}`}></div>
            </div>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-6xl font-bold tracking-tight">{latest.temp?.toFixed(1) || '--'}</span>
              <span className="text-xl text-slate-400 font-light">°C</span>
            </div>
            <span className={`inline-block px-4 py-2 rounded-xl text-[10px] font-bold tracking-wider uppercase bg-white/5 ${getTempStatus(latest.temp).color}`}>
              {getTempStatus(latest.temp).text}
            </span>
          </div>

          {/* Humedad */}
          <div className="bg-slate-800/40 p-8 rounded-3xl border border-white/5 backdrop-blur-md shadow-lg transition-transform hover:-translate-y-1">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-300">Humedad</span>
              <div className={`w-3 h-3 rounded-full animate-pulse shadow-[0_0_15px_currentColor] ${getHumStatus(latest.hum).bg}`}></div>
            </div>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-6xl font-bold tracking-tight">{Math.round(latest.hum) || '--'}</span>
              <span className="text-xl text-slate-400 font-light">% RH</span>
            </div>
            <span className={`inline-block px-4 py-2 rounded-xl text-[10px] font-bold tracking-wider uppercase bg-white/5 ${getHumStatus(latest.hum).color}`}>
              {getHumStatus(latest.hum).text}
            </span>
          </div>

          {/* Gas */}
          <div className="bg-slate-800/40 p-8 rounded-3xl border border-white/5 backdrop-blur-md shadow-lg transition-transform hover:-translate-y-1">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-300">Gas (Calidad Aire)</span>
              <div className={`w-3 h-3 rounded-full animate-pulse shadow-[0_0_15px_currentColor] ${getGasStatus(latest.ppm).bg}`}></div>
            </div>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-6xl font-bold tracking-tight">{latest.ppm > 9999 ? '>9999' : Math.round(latest.ppm) || '--'}</span>
              <span className="text-xl text-slate-400 font-light">ppm</span>
            </div>
            <span className={`inline-block px-4 py-2 rounded-xl text-[10px] font-bold tracking-wider uppercase bg-white/5 ${getGasStatus(latest.ppm).color}`}>
              {getGasStatus(latest.ppm).text}
            </span>
          </div>

          {/* Movimiento */}
          <div className="bg-slate-800/40 p-8 rounded-3xl border border-white/5 backdrop-blur-md shadow-lg transition-transform hover:-translate-y-1">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-300">Movimiento</span>
              <div className={`w-3 h-3 rounded-full animate-pulse shadow-[0_0_15px_currentColor] ${getMovStatus(latest.mov).bg}`}></div>
            </div>
            <div className="flex items-baseline gap-2 mb-6 mt-2 h-[60px] items-center">
              <span className="text-4xl font-bold tracking-tight">{getMovStatus(latest.mov).val}</span>
            </div>
            <span className={`inline-block px-4 py-2 rounded-xl text-[10px] font-bold tracking-wider uppercase bg-white/5 ${getMovStatus(latest.mov).color}`}>
              {getMovStatus(latest.mov).text}
            </span>
          </div>
        </div>

        {/* Charts Section */}
        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 backdrop-blur-md">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-sky-400">
            <Activity /> Gráfica General Histórica
          </h2>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <Line type="monotone" dataKey="temp" stroke="#38bdf8" strokeWidth={3} dot={false} name="Temperatura (°C)" />
                <Line type="monotone" dataKey="hum" stroke="#10b981" strokeWidth={3} dot={false} name="Humedad (%)" />
                <Line type="monotone" dataKey="ppm" stroke="#f59e0b" strokeWidth={3} dot={false} name="Gas (ppm)" />
                <CartesianGrid stroke="#1e293b" strokeDasharray="5 5" />
                <XAxis dataKey="time" stroke="#64748b" tick={{fill: '#64748b'}} />
                <YAxis stroke="#64748b" tick={{fill: '#64748b'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', color: '#f8fafc' }}
                  itemStyle={{ fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Instant Anomaly Toast */}
      {toast.visible && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 ${toast.isCritical ? 'bg-red-500/90 border-red-400 shadow-[0_10px_40px_rgba(239,68,68,0.4)]' : 'bg-slate-800/90 border-sky-400/50 shadow-[0_10px_40px_rgba(56,189,248,0.2)]'} backdrop-blur-xl border text-white px-6 py-4 rounded-2xl flex items-center gap-4 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300`}>
          <BellRing className={`animate-bounce ${toast.isCritical ? 'text-white' : 'text-sky-400'}`} />
          <div>
            <h4 className="font-bold">{toast.title}</h4>
            <p className="text-sm opacity-90">{toast.message}</p>
          </div>
          <button onClick={() => setToast(prev => ({...prev, visible: false}))} className="ml-4 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
