"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { insforge } from "./insforge-client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { BellRing, Activity, WifiOff, Wifi, ChevronRight, ChevronLeft, TrendingUp, TrendingDown, Minus, Zap, Clock, Shield } from "lucide-react";

// -- Tipo para datos en vivo (tabla sensor_live) --
interface LiveData {
  id: string;
  created_at: string;
  temp: number;
  hum: number;
  ppm: number;
  mov: boolean;
  baseline_ppm: number;
}

// -- Tipo para reportes enriquecidos (tabla sensor_readings) --
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
  temp_min?: number;
  temp_max?: number;
  ppm_min?: number;
  ppm_max?: number;
  hum_min?: number;
  hum_max?: number;
  ppm_trend?: string;
  temp_trend?: string;
  events?: string;
  total_samples?: number;
}

// -- Generar narrativa del reporte en el frontend --
function generarNarrativa(r: SensorData): string {
  const parts: string[] = [];
  const delta = r.ppm - (r.baseline_ppm || 0);
  if (delta < 10) parts.push("Aire limpio durante el periodo.");
  else if (delta < 50) parts.push("Ligera presencia de partículas detectada.");
  else if (delta < 200) parts.push("Nivel de gas elevado respecto al baseline.");
  else parts.push("⚠️ Concentración de gas peligrosa detectada.");

  if (r.ppm_trend === "rising") parts.push("Tendencia ascendente en gas.");
  else if (r.ppm_trend === "falling") parts.push("Tendencia descendente en gas.");
  else if (r.ppm_trend === "spike") parts.push("Se detectó un pico significativo de gas.");
  else parts.push("Niveles de gas estables.");

  if (r.temp > 35) parts.push(`Temperatura elevada (${r.temp.toFixed(1)}°C).`);
  else if (r.temp < 10) parts.push(`Temperatura baja (${r.temp.toFixed(1)}°C).`);
  else parts.push("Temperatura en rango normal.");

  if (r.mov_percent > 50) parts.push(`Alta actividad de movimiento (${r.mov_percent.toFixed(0)}%).`);
  else if (r.mov_percent > 0) parts.push("Actividad moderada detectada.");
  else parts.push("Sin movimiento detectado.");

  return parts.join(" ");
}

function getTrendIcon(trend?: string) {
  if (trend === "rising") return <TrendingUp size={14} className="text-red-500" />;
  if (trend === "falling") return <TrendingDown size={14} className="text-blue-500" />;
  if (trend === "spike") return <Zap size={14} className="text-amber-500" />;
  return <Minus size={14} className="text-gray-400" />;
}

function parseEvents(eventsStr?: string): string[] {
  if (!eventsStr) return [];
  try {
    const parsed = JSON.parse(eventsStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// --- COMPONENTE SENSOR CARD ---
const SensorCard = ({ title, value, unit, status, sparkKey, color, sparklineData, isOffline }: any) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const displayVal = isOffline ? 0 : (typeof value === 'number' ? value : 0);
  
  return (
    <div 
      className="perspective-1000 h-[280px] cursor-pointer group"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div className={`flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
        
        {/* FRENTE: Solo Gráfica de Tendencia (Limpia) */}
        <div className="flip-card-front p-5 border border-black/5 bg-white rounded-3xl overflow-hidden shadow-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{title}</span>
            <div className={`w-3 h-3 rounded-full ${status.bg} shadow-[0_0_8px_currentColor]`}></div>
          </div>
          
          <div className="flex-1 -mx-2 overflow-hidden mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData} margin={{left: -15, right: 5, top: 5, bottom: 0}}>
                <defs>
                  <linearGradient id={`gradient-${sparkKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.35}/>
                    <stop offset="95%" stopColor={color} stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <YAxis 
                  domain={(sparkKey === 'hum' || sparkKey === 'mov') ? [0, 100] : ['auto', 'auto']} 
                  tick={{fill: '#B0B0B0', fontSize: 9, fontWeight: 'bold'}} 
                  tickLine={false} 
                  axisLine={false} 
                  width={35}
                />
                <Area type="monotone" dataKey={sparkKey} stroke={color} fillOpacity={1} fill={`url(#gradient-${sparkKey})`} strokeWidth={3} isAnimationActive={true} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="text-center py-2 border-t border-black/5 mt-1">
            <span className="text-[9px] font-black text-[var(--color-primary)] uppercase tracking-widest flex items-center justify-center gap-1">
              CLICK PARA DETALLES ➔
            </span>
          </div>
        </div>

        {/* REVERSO: Datos Numéricos Grandes */}
        <div className="flip-card-back p-6 border-2 border-[var(--color-primary)]/10 bg-white rounded-3xl shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">{title}</span>
            <div className={`w-4 h-4 rounded-full shadow-[0_0_12px_currentColor] ${status.bg}`}></div>
          </div>
          <div className="flex flex-col items-center justify-center flex-1">
            <div className="flex items-baseline gap-1">
              <span className="text-6xl font-black tracking-tighter text-[var(--color-text-main)]">{displayVal.toFixed(1)}</span>
              <span className="text-xl text-[var(--color-text-muted)] font-black">{unit}</span>
            </div>
          </div>
          <div className="mt-auto text-center pt-4 border-t border-black/5">
            <span className={`inline-block px-5 py-2 rounded-2xl text-[10px] font-black tracking-widest uppercase bg-black/5 ${status.color}`}>{status.text}</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export function Dashboard({ dashboardUrl }: { dashboardUrl: string }) {
  const [data, setData] = useState<SensorData[]>([]);
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [liveHistory, setLiveHistory] = useState<LiveData[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [toast, setToast] = useState<{ message: string; visible: boolean; isCritical: boolean; title?: string }>({ message: "", visible: false, isCritical: false });
  const [isOffline, setIsOffline] = useState(false);

  const [lastProcessedId, setLastProcessedId] = useState<string | null>(null);
  const [nextReportIn, setNextReportIn] = useState(60);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<SensorData | null>(null);
  const itemsPerPage = 10;

  // Fetch live data every 3 seconds (lightweight - just 1 row)
  const fetchLive = useCallback(async () => {
    const { data: liveRows, error } = await insforge.database
      .from("sensor_live")
      .select().order("created_at", { ascending: false }).limit(1);
    if (!error && liveRows && liveRows.length > 0) {
      const newLive = liveRows[0] as LiveData;
      setLiveData(newLive);
      setLiveHistory(prev => {
        if (prev.length > 0 && prev[0].id === newLive.id) return prev;
        return [newLive, ...prev].slice(0, 30);
      });
      const elapsed = Date.now() - new Date(newLive.created_at).getTime();
      setIsOffline(elapsed > 15000);
    }
  }, []);

  // Fetch reports (heavier, less frequent)
  const fetchReports = useCallback(async () => {
    const { data: rawData, error } = await insforge.database
      .from("sensor_readings")
      .select().order("created_at", { ascending: false }).limit(200);
    if (!error && rawData) setData(rawData as SensorData[]);
  }, []);

  useEffect(() => {
    fetchLive();
    fetchReports();
    const liveInterval = setInterval(fetchLive, 3000);
    const reportInterval = setInterval(fetchReports, 15000);
    return () => { clearInterval(liveInterval); clearInterval(reportInterval); };
  }, [fetchLive, fetchReports]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (data.length > 0) {
        const latestTime = new Date(data[0].created_at).getTime();
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - latestTime) / 1000);
        const remaining = 60 - (elapsedSeconds % 60);
        setNextReportIn(remaining);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [data]);

  useEffect(() => {
    if (data.length > 0) {
      const latestData = data[0];
      if (latestData.id !== lastProcessedId) {
        setLastProcessedId(latestData.id);
        if (latestData.is_emergency) {
          setToast({ message: `¡PELIGRO! Temp: ${latestData.temp}°C, Gas: ${latestData.ppm}ppm`, visible: true, isCritical: true, title: "¡ALERTA DE EMERGENCIA!" });
          setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 10000);
        }
      }
    }
  }, [data, lastProcessedId]);

  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (!startDate && !endDate) return true;
      const dTime = new Date(d.created_at).getTime();
      const sTime = startDate ? new Date(startDate).getTime() : 0;
      const eTime = endDate ? new Date(endDate).getTime() : Infinity;
      return dTime >= sTime && dTime <= eTime;
    });
  }, [data, startDate, endDate]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  const latest = useMemo(() => {
    if (liveData && !isOffline) return { temp: liveData.temp, hum: liveData.hum, ppm: liveData.ppm, mov_percent: liveData.mov ? 100 : 0, baseline_ppm: liveData.baseline_ppm, id: liveData.id };
    if (data.length > 0) return data[0];
    return { temp: 0, hum: 0, ppm: 0, mov_percent: 0, baseline_ppm: 0, id: 'offline' };
  }, [liveData, data, isOffline]);

  const getStatus = (type: string, val: number, base?: number) => {
    if (val === 0 && isOffline) return { color: "text-gray-400", text: "APAGADO", bg: "bg-gray-400" };
    if (type === 'temp') {
      if (val < 10 || val > 40) return { color: "text-[#EF4444]", text: "CRÍTICA", bg: "bg-[#EF4444]" };
      return { color: "text-[#22C55E]", text: "IDEAL", bg: "bg-[#22C55E]" };
    }
    if (type === 'hum') {
      if (val < 20 || val > 70) return { color: "text-[#EF4444]", text: "CRÍTICA", bg: "bg-[#EF4444]" };
      return { color: "text-[#22C55E]", text: "ÓPTIMA", bg: "bg-[#22C55E]" };
    }
    if (type === 'gas') {
      const delta = val - (base || 0);
      if (val > 300 || delta > 200) return { color: "text-[#EF4444]", text: "PELIGRO", bg: "bg-[#EF4444]" };
      if (val > 100 || delta > 50) return { color: "text-[#F59E0B]", text: "RIESGO", bg: "bg-[#F59E0B]" };
      return { color: "text-[#22C55E]", text: "SEGURO", bg: "bg-[#22C55E]" };
    }
    if (val > 50) return { color: "text-[#EF4444]", text: "ALTA", bg: "bg-[#EF4444]" };
    return { color: "text-[#22C55E]", text: "NORMAL", bg: "bg-[#22C55E]" };
  };

  const sparklineData = useMemo(() => {
    if (liveHistory.length > 3) return liveHistory.slice(0, 20).reverse().map(d => ({ temp: d.temp, hum: d.hum, ppm: d.ppm, mov: d.mov ? 100 : 0 }));
    return data.slice(0, 20).reverse().map(d => ({ temp: d.temp, hum: d.hum, ppm: d.ppm, mov: d.mov_percent }));
  }, [liveHistory, data]);
  const chartData = useMemo(() => [...filteredData].reverse().map(d => ({ time: format(parseISO(d.created_at), "HH:mm"), temp: d.temp, hum: d.hum, ppm: d.ppm, mov: d.mov_percent })), [filteredData]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-dark)] text-[var(--color-text-main)] p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col items-center mb-8 pt-4">
          <Activity size={80} className="text-[var(--color-primary)] animate-pulse mb-4" />
          <h1 className="text-5xl font-black tracking-tight uppercase italic text-[var(--color-primary)]">SAFESPACE</h1>
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            <div className={`px-6 py-2 border rounded-full flex items-center gap-3 ${isOffline ? 'bg-red-500/10 border-red-500/30 text-red-600' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'}`}>
              {isOffline ? <WifiOff size={18} /> : <Wifi size={18} />}
              <span className="text-sm font-black uppercase tracking-widest">{isOffline ? "SISTEMA APAGADO" : "SISTEMA EN LÍNEA"}</span>
            </div>
            {!isOffline && (
              <div className="px-6 py-2 border border-black/10 bg-white rounded-full flex items-center gap-3">
                <span className="text-sm font-black uppercase tracking-widest">REPORTE: <span className="text-[var(--color-primary)]">{nextReportIn}s</span></span>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-xl max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="flex flex-col"><label className="text-[10px] font-black uppercase mb-2">Desde</label><input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-gray-50 border border-black/5 rounded-xl px-4 py-3 text-sm" /></div>
          <div className="flex flex-col"><label className="text-[10px] font-black uppercase mb-2">Hasta</label><input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-gray-50 border border-black/5 rounded-xl px-4 py-3 text-sm" /></div>
          <button onClick={() => {setStartDate(""); setEndDate(""); setCurrentPage(1);}} className="w-full py-3 bg-black text-white rounded-xl text-xs font-black tracking-widest uppercase">LIMPIAR</button>
        </div>

        {/* Cards Grid */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto ${isOffline ? 'opacity-70 grayscale-[0.3]' : ''}`}>
          <SensorCard title="Temperatura" value={latest.temp} unit="°C" status={getStatus('temp', latest.temp)} sparkKey="temp" color="#EF4444" sparklineData={sparklineData} isOffline={isOffline} />
          <SensorCard title="Humedad" value={latest.hum} unit="%" status={getStatus('hum', latest.hum)} sparkKey="hum" color="#3B82F6" sparklineData={sparklineData} isOffline={isOffline} />
          <SensorCard title="Gas (Aire)" value={latest.ppm} unit="ppm" status={getStatus('gas', latest.ppm, latest.baseline_ppm)} sparkKey="ppm" color="#10B981" sparklineData={sparklineData} isOffline={isOffline} />
          <SensorCard title="Actividad" value={latest.mov_percent} unit="%" status={getStatus('mov', latest.mov_percent)} sparkKey="mov" color="#E8832A" sparklineData={sparklineData} isOffline={isOffline} />
        </div>

        {/* Historico Chart */}
        <div className="bg-white border border-black/5 rounded-[2rem] p-8 shadow-xl max-w-7xl mx-auto">
          <h2 className="text-xl font-black mb-8 flex items-center gap-3 text-[var(--color-primary)] uppercase italic"><Activity /> Histórico de Monitoreo</h2>
          <div className="h-[450px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#EF4444" stopOpacity={0.1}/><stop offset="95%" stopColor="#EF4444" stopOpacity={0}/></linearGradient>
                  <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/><stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/></linearGradient>
                  <linearGradient id="colorGas" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient>
                  <linearGradient id="colorMov" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E8832A" stopOpacity={0.1}/><stop offset="95%" stopColor="#E8832A" stopOpacity={0}/></linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#A0A0A0" tick={{fill: '#A0A0A0', fontSize: 11}} tickLine={false} axisLine={false} />
                <YAxis stroke="#A0A0A0" tick={{fill: '#A0A0A0', fontSize: 11}} tickLine={false} axisLine={false} />
                <CartesianGrid stroke="#F0F0F0" vertical={false} />
                <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 15px 35px rgba(0,0,0,0.1)' }} />
                <Legend iconType="circle" />
                <Area type="monotone" dataKey="temp" stroke="#EF4444" fill="url(#colorTemp)" strokeWidth={3} name="Temp (°C)" />
                <Area type="monotone" dataKey="hum" stroke="#3B82F6" fill="url(#colorHum)" strokeWidth={3} name="Hum (%)" />
                <Area type="monotone" dataKey="ppm" stroke="#10B981" fill="url(#colorGas)" strokeWidth={3} name="Gas (ppm)" />
                <Area type="monotone" dataKey="mov" stroke="#E8832A" fill="url(#colorMov)" strokeWidth={3} name="Mov (%)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Listado de Reportes con Paginación */}
        <div className="bg-white border border-black/5 rounded-[2rem] p-8 shadow-xl max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <h2 className="text-2xl font-black text-[var(--color-primary)] uppercase italic flex items-center gap-3"><BellRing /> Listado de Reportes</h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 bg-gray-100 rounded-xl disabled:opacity-30 hover:bg-gray-200 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="bg-black text-white px-4 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase">
                Página {currentPage} de {Math.max(1, totalPages)}
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 bg-gray-100 rounded-xl disabled:opacity-30 hover:bg-gray-200 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-gray-100 text-[10px] uppercase font-black tracking-widest text-gray-400"><th className="pb-4 px-4">Fecha/Hora</th><th className="pb-4 px-4">Estado</th><th className="pb-4 px-4 text-center">Detalle</th></tr></thead>
              <tbody>
                {paginatedReports.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-all">
                    <td className="py-5 px-4"><span className="font-black block">{format(parseISO(r.created_at), "dd/MM/yyyy")}</span><span className="text-xs text-gray-400 font-bold">{format(parseISO(r.created_at), "HH:mm:ss")}</span></td>
                    <td className="py-5 px-4"><span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase ${r.is_emergency ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>{r.is_emergency ? 'EMERGENCIA' : 'NORMAL'}</span></td>
                    <td className="py-5 px-4 text-center"><button onClick={() => setSelectedReport(r)} className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-widest hover:underline">Ver Detalles</button></td>
                  </tr>
                ))}
                {paginatedReports.length === 0 && (
                  <tr><td colSpan={3} className="py-20 text-center text-gray-400 font-black uppercase tracking-widest text-xs">No hay datos en este rango</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL REPORTE ENRIQUECIDO */}
      {selectedReport && (() => {
        const events = parseEvents(selectedReport.events);
        const narrative = generarNarrativa(selectedReport);
        return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden border border-black/5 my-8">
            {/* Header */}
            <div className="bg-[var(--color-primary)] p-8 text-white text-center relative">
              {selectedReport.is_emergency && <div className="absolute top-3 right-3 bg-red-600 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">Emergencia</div>}
              <Shield size={36} className="mx-auto mb-2 opacity-80" />
              <h3 className="text-2xl font-black uppercase tracking-tighter italic">Reporte Detallado</h3>
              <p className="text-xs font-bold opacity-80 mt-1 uppercase tracking-[0.2em]">{format(parseISO(selectedReport.created_at), "dd MMM yyyy, HH:mm:ss")}</p>
              {selectedReport.total_samples && <p className="text-[10px] mt-2 opacity-60">{selectedReport.total_samples} muestras en 60 segundos</p>}
            </div>
            
            <div className="p-6 space-y-5">
              {/* Sensor cards con rangos */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Temperatura", val: selectedReport.temp, unit: "°C", min: selectedReport.temp_min, max: selectedReport.temp_max, trend: selectedReport.temp_trend, col: "text-red-500", bg: "bg-red-50", icon: "🌡️" },
                  { label: "Humedad", val: selectedReport.hum, unit: "%", min: selectedReport.hum_min, max: selectedReport.hum_max, trend: undefined, col: "text-blue-500", bg: "bg-blue-50", icon: "💧" },
                  { label: "Gas (PPM)", val: selectedReport.ppm, unit: "ppm", min: selectedReport.ppm_min, max: selectedReport.ppm_max, trend: selectedReport.ppm_trend, col: "text-emerald-500", bg: "bg-emerald-50", icon: "💨" },
                  { label: "Movimiento", val: selectedReport.mov_percent, unit: "%", min: undefined, max: undefined, trend: undefined, col: "text-orange-500", bg: "bg-orange-50", icon: "🏃" }
                ].map(item => (
                  <div key={item.label} className={`${item.bg} p-4 rounded-2xl border border-black/5`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">{item.label}</span>
                      <span className="text-lg">{item.icon}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-3xl font-black ${item.col} tracking-tighter`}>{item.val?.toFixed(1)}</span>
                      <span className="text-xs text-gray-400 font-bold">{item.unit}</span>
                      {item.trend && <span className="ml-1">{getTrendIcon(item.trend)}</span>}
                    </div>
                    {item.min != null && item.max != null && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-gray-400 font-bold">↕ {item.min.toFixed(1)} – {item.max.toFixed(1)}{item.unit}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Narrativa */}
              <div className="bg-gray-50 rounded-2xl p-5 border border-black/5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)] mb-2 flex items-center gap-2"><Activity size={14} /> Análisis del Periodo</h4>
                <p className="text-sm text-gray-700 leading-relaxed">{narrative}</p>
              </div>

              {/* Timeline de eventos */}
              {events.length > 0 && (
                <div className="bg-gray-50 rounded-2xl p-5 border border-black/5">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)] mb-3 flex items-center gap-2"><Clock size={14} /> Timeline de Eventos</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {events.map((evt, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <span className="text-lg">{evt.toLowerCase().includes("critico") || evt.toLowerCase().includes("emergencia") ? "🔴" : evt.toLowerCase().includes("elevado") ? "🟡" : evt.toLowerCase().includes("movimiento") ? "🟠" : "🟢"}</span>
                        <span className="text-gray-600 font-medium">{evt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {events.length === 0 && (
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 text-center">
                  <span className="text-sm text-emerald-600 font-bold">✅ Sin eventos significativos durante este periodo</span>
                </div>
              )}

              <button onClick={() => setSelectedReport(null)} className="w-full py-5 bg-black text-white hover:bg-gray-900 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl">Cerrar Reporte</button>
            </div>
          </div>
        </div>
        );
      })()}

      {toast.visible && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 ${toast.isCritical ? 'bg-red-600' : 'bg-black'} text-white px-10 py-6 rounded-full flex items-center gap-6 z-[250] shadow-2xl`}>
          <BellRing className="animate-bounce" />
          <div className="flex flex-col"><h4 className="font-black text-lg uppercase tracking-tighter italic leading-none">{toast.title}</h4><p className="text-xs font-bold opacity-80 uppercase tracking-wide mt-1">{toast.message}</p></div>
        </div>
      )}
    </div>
  );
}
