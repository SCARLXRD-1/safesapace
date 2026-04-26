"use client";

import { useEffect, useState, useMemo } from "react";
import { insforge } from "./insforge-client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { format, parseISO } from "date-fns";
import { BellRing, Activity, AlertTriangle, WifiOff, Wifi, ChevronRight } from "lucide-react";

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

// --- COMPONENTE SENSOR CARD (OPTIMIZADO) ---
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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [toast, setToast] = useState<{ message: string; visible: boolean; isCritical: boolean; title?: string }>({ message: "", visible: false, isCritical: false });
  const [isOffline, setIsOffline] = useState(false);

  const [lastProcessedId, setLastProcessedId] = useState<string | null>(null);
  const [nextReportIn, setNextReportIn] = useState(60);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<SensorData | null>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

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
      const latestTime = new Date(latestData.created_at).getTime();
      const now = Date.now();
      
      // Umbral offline: 150 seg
      setIsOffline(now - latestTime > 150000);

      if (latestData.id !== lastProcessedId) {
        setLastProcessedId(latestData.id);
        if (latestData.is_emergency) {
          setToast({ message: `¡PELIGRO! Temp: ${latestData.temp}°C, Gas: ${latestData.ppm}ppm`, visible: true, isCritical: true, title: "¡ALERTA DE EMERGENCIA!" });
          setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 10000);
        }
      }
    }
  }, [data, lastProcessedId]);

  async function fetchData() {
    const { data: rawData, error } = await insforge.database
      .from("sensor_readings")
      .select().order("created_at", { ascending: false }).limit(1000);
    if (!error && rawData) setData(rawData as SensorData[]);
  }

  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (!startDate && !endDate) return true;
      const dTime = new Date(d.created_at).getTime();
      const sTime = startDate ? new Date(startDate).getTime() : 0;
      const eTime = endDate ? new Date(endDate).getTime() : Infinity;
      return dTime >= sTime && dTime <= eTime;
    });
  }, [data, startDate, endDate]);

  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  const latest = useMemo(() => {
    if (isOffline || data.length === 0) return { temp: 0, hum: 0, ppm: 0, mov_percent: 0, baseline_ppm: 0, id: 'offline' };
    return data[0];
  }, [data, isOffline]);

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

  const sparklineData = useMemo(() => data.slice(0, 20).reverse().map(d => ({ temp: d.temp, hum: d.hum, ppm: d.ppm, mov: d.mov_percent })), [data]);
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
          <button onClick={() => {setStartDate(""); setEndDate("");}} className="w-full py-3 bg-black text-white rounded-xl text-xs font-black tracking-widest uppercase">LIMPIAR</button>
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

        {/* Listado de Reportes */}
        <div className="bg-white border border-black/5 rounded-[2rem] p-8 shadow-xl max-w-7xl mx-auto">
          <h2 className="text-2xl font-black text-[var(--color-primary)] mb-8 uppercase italic flex items-center gap-3"><BellRing /> Listado de Reportes</h2>
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
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL DETALLES */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-black/5">
            <div className="bg-[var(--color-primary)] p-10 text-white text-center">
              <h3 className="text-3xl font-black uppercase tracking-tighter italic leading-none">Reporte Detallado</h3>
              <p className="text-xs font-bold opacity-80 mt-2 uppercase tracking-[0.3em]">{format(parseISO(selectedReport.created_at), "dd MMM yyyy, HH:mm:ss")}</p>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                {[
                  { label: "Temp", val: selectedReport.temp.toFixed(1) + "°C", col: "text-red-500", icon: "🌡️" },
                  { label: "Hum", val: selectedReport.hum.toFixed(0) + "%", col: "text-blue-500", icon: "💧" },
                  { label: "Gas", val: selectedReport.ppm.toFixed(0) + "ppm", col: "text-emerald-500", icon: "💨" },
                  { label: "Mov", val: selectedReport.mov_percent.toFixed(0) + "%", col: "text-orange-500", icon: "🏃" }
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 p-6 rounded-[2rem] border border-black/5 flex flex-col items-center justify-center text-center shadow-sm">
                    <span className="text-[24px] mb-2">{item.icon}</span>
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">{item.label}</span>
                    <span className={`text-4xl font-black ${item.col} tracking-tighter`}>{item.val}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setSelectedReport(null)} className="w-full py-6 bg-black text-white hover:bg-gray-900 rounded-[2rem] font-black uppercase tracking-[0.3em] text-xs transition-all shadow-xl">CERRAR REPORTE</button>
            </div>
          </div>
        </div>
      )}

      {toast.visible && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 ${toast.isCritical ? 'bg-red-600' : 'bg-black'} text-white px-10 py-6 rounded-full flex items-center gap-6 z-[250] shadow-2xl`}>
          <BellRing className="animate-bounce" />
          <div className="flex flex-col"><h4 className="font-black text-lg uppercase tracking-tighter italic leading-none">{toast.title}</h4><p className="text-xs font-bold opacity-80 uppercase tracking-wide mt-1">{toast.message}</p></div>
        </div>
      )}
    </div>
  );
}
