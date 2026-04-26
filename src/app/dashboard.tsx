"use client";

import { useEffect, useState, useMemo } from "react";
import { insforge } from "./insforge-client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { format, parseISO } from "date-fns";
import { BellRing, Activity, AlertTriangle, WifiOff, Wifi } from "lucide-react";

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

// --- COMPONENTE FUERA PARA EVITAR RE-RENDER BUG (FLIP BUG) ---
const SensorCard = ({ title, value, unit, status, sparkKey, color, sparklineData, isOffline }: any) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const displayVal = isOffline ? 0 : (typeof value === 'number' ? value : 0);
  
  return (
    <div 
      className="perspective-1000 h-[280px] cursor-pointer group"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div className={`flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
        
        {/* FRENTE: Gráfica + Valor actual superpuesto */}
        <div className="flip-card-front p-5 border border-black/5 bg-white rounded-3xl overflow-hidden shadow-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{title}</span>
            <div className={`w-3 h-3 rounded-full ${status.bg} shadow-[0_0_8px_currentColor]`}></div>
          </div>
          
          {/* Valor actual sobre la gráfica */}
          <div className="absolute top-12 left-5 z-10 pointer-events-none">
            <span className="text-3xl font-black tracking-tighter" style={{color}}>{displayVal.toFixed(1)}</span>
            <span className="text-xs font-bold ml-1" style={{color}}>{unit}</span>
          </div>
          
          <div className="flex-1 -mx-1 overflow-hidden mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData} margin={{left: 0, right: 0, top: 5, bottom: 0}}>
                <defs>
                  <linearGradient id={`gradient-${sparkKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.35}/>
                    <stop offset="95%" stopColor={color} stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <YAxis 
                  domain={(sparkKey === 'hum' || sparkKey === 'mov') ? [0, 100] : ['auto', 'auto']} 
                  tick={{fill: '#B0B0B0', fontSize: 9}} 
                  tickLine={false} 
                  axisLine={false} 
                  width={28}
                  tickFormatter={(v: number) => `${Math.round(v)}`}
                />
                <ReferenceLine y={displayVal} stroke={color} strokeDasharray="4 4" strokeOpacity={0.5} />
                <Area type="monotone" dataKey={sparkKey} stroke={color} fillOpacity={1} fill={`url(#gradient-${sparkKey})`} strokeWidth={3} isAnimationActive={true} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="text-center py-1.5 border-t border-black/5 mt-1">
            <span className="text-[9px] font-black text-[var(--color-primary)] uppercase tracking-widest">CLICK PARA DETALLES ➔</span>
          </div>
        </div>

        {/* REVERSO: Datos Numéricos */}
        <div className="flip-card-back p-6 border-2 border-[var(--color-primary)]/10 bg-white rounded-3xl shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">{title}</span>
            <div className={`w-4 h-4 rounded-full shadow-[0_0_12px_currentColor] ${status.bg}`}></div>
          </div>
          <div className="flex flex-col items-center justify-center flex-1">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-black tracking-tighter text-[var(--color-text-main)]">{displayVal.toFixed(1)}</span>
              <span className="text-lg text-[var(--color-text-muted)] font-black">{unit}</span>
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
      
      // Umbral de offline: 150 segundos (basado en intervalo de 60s)
      setIsOffline(now - latestTime > 150000);

      if (latestData.id !== lastProcessedId) {
        setLastProcessedId(latestData.id);
        
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
    const { data: rawData, error } = await insforge.database
      .from("sensor_readings")
      .select()
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!error && rawData) {
      setData(rawData as SensorData[]);
    }
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

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  const latest = useMemo(() => {
    if (isOffline || data.length === 0) {
      return { temp: 0, hum: 0, ppm: 0, mov_percent: 0, baseline_ppm: 0, id: 'offline' };
    }
    return data[0];
  }, [data, isOffline]);

  const getTempStatus = (t: number) => {
    if (t === 0 && isOffline) return { color: "text-gray-400", text: "SISTEMA APAGADO", bg: "bg-gray-400" };
    if (t < 10 || t > 40) return { color: "text-[#EF4444]", text: "TEMP. CRÍTICA", bg: "bg-[#EF4444]" };
    if (t < 15 || t > 35) return { color: "text-[#F59E0B]", text: "TEMP. ANORMAL", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "TEMPERATURA IDEAL", bg: "bg-[#22C55E]" };
  };
  
  const getHumStatus = (h: number) => {
    if (h === 0 && isOffline) return { color: "text-gray-400", text: "SISTEMA APAGADO", bg: "bg-gray-400" };
    if (h < 20 || h > 70) return { color: "text-[#EF4444]", text: "HUMEDAD CRÍTICA", bg: "bg-[#EF4444]" };
    if (h < 30 || h > 60) return { color: "text-[#F59E0B]", text: "HUMEDAD ANORMAL", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "HUMEDAD ÓPTIMA", bg: "bg-[#22C55E]" };
  };

  const getGasStatus = (g: number, base: number) => {
    if (g === 0 && isOffline) return { color: "text-gray-400", text: "SISTEMA APAGADO", bg: "bg-gray-400" };
    const delta = g - base;
    // Umbrales absolutos realistas para espacios cerrados
    if (g > 300 || delta > 200) return { color: "text-[#EF4444]", text: "ALERTA MÁXIMA", bg: "bg-[#EF4444]" };
    if (g > 100 || delta > 50) return { color: "text-[#F59E0B]", text: "RIESGO MEDIO", bg: "bg-[#F59E0B]" };
    return { color: "text-[#22C55E]", text: "NIVEL SEGURO", bg: "bg-[#22C55E]" };
  };

  const getMovStatus = (p: number) => {
    if (p === 0 && isOffline) return { color: "text-gray-400", text: "SISTEMA APAGADO", bg: "bg-gray-400" };
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

  const sparklineData = useMemo(() => {
    return data.slice(0, 20).reverse().map(d => ({
      temp: d.temp,
      hum: d.hum,
      ppm: d.ppm,
      mov: d.mov_percent
    }));
  }, [data]);

  const cardOpacity = isOffline ? "opacity-70 transition-all duration-1000" : "opacity-100";

  return (
    <div className="min-h-screen bg-[var(--color-bg-dark)] text-[var(--color-text-main)] p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col items-center mb-8 pt-4">
          <div className="relative w-24 h-24 mb-4">
            <Activity size={80} className="text-[var(--color-primary)] animate-pulse" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight uppercase" style={{
            background: 'linear-gradient(to right, var(--color-primary), var(--color-secondary))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            SAFESPACE
          </h1>
          <p className="text-[var(--color-text-muted)] mt-2 font-medium">Sistema Inteligente de Monitoreo</p>
          
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            <div className={`px-6 py-2 border rounded-full flex items-center gap-3 transition-colors ${isOffline ? 'bg-red-500/10 border-red-500/30 text-red-600' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'}`}>
              {isOffline ? <WifiOff size={18} /> : <Wifi size={18} />}
              <span className="text-[15px] font-bold tracking-wide text-center">
                {isOffline ? "SISTEMA APAGADO" : "SISTEMA EN LÍNEA"}
              </span>
            </div>

            {!isOffline && (
              <div className="px-6 py-2 border border-black/10 bg-white rounded-full flex items-center gap-3 shadow-sm">
                <Activity size={18} className="text-[var(--color-primary)]" />
                <span className="text-[15px] font-bold tracking-wide text-[var(--color-text-main)]">
                  REPORTE EN: <span className="text-[var(--color-primary)]">{nextReportIn}s</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[var(--color-surface)] border border-black/5 rounded-2xl p-6 shadow-xl max-w-3xl mx-auto">
          <div className="flex flex-wrap gap-4 items-end justify-center">
            <div className="flex flex-col">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">Desde</label>
              <input 
                type="datetime-local" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-[var(--color-bg-dark)] border border-black/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">Hasta</label>
              <input 
                type="datetime-local" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-[var(--color-bg-dark)] border border-black/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all"
              />
            </div>
            <button 
              onClick={() => {setStartDate(""); setEndDate("");}}
              className="px-6 py-3 bg-white border border-black/5 hover:bg-black/5 rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              LIMPIAR
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto ${cardOpacity}`}>
          <SensorCard 
            title="Temperatura" 
            value={latest.temp} 
            unit="°C" 
            status={getTempStatus(latest.temp)} 
            sparkKey="temp"
            color="#EF4444"
            sparklineData={sparklineData}
            isOffline={isOffline}
          />
          <SensorCard 
            title="Humedad" 
            value={latest.hum} 
            unit="% RH" 
            status={getHumStatus(latest.hum)} 
            sparkKey="hum"
            color="#3B82F6"
            sparklineData={sparklineData}
            isOffline={isOffline}
          />
          <SensorCard 
            title="Calidad Aire" 
            value={latest.ppm > 9999 ? '>9k' : latest.ppm} 
            unit="ppm" 
            status={getGasStatus(latest.ppm, latest.baseline_ppm)} 
            sparkKey="ppm"
            color="#10B981"
            sparklineData={sparklineData}
            isOffline={isOffline}
          />
          <SensorCard 
            title="Actividad" 
            value={latest.mov_percent} 
            unit="%" 
            status={getMovStatus(latest.mov_percent)} 
            sparkKey="mov"
            color="#E8832A"
            sparklineData={sparklineData}
            isOffline={isOffline}
          />
        </div>

        {/* Charts Section */}
        <div className="bg-[var(--color-surface)] border border-black/5 rounded-3xl p-6 shadow-xl max-w-7xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-[var(--color-primary)]">
            <Activity size={24} /> Histórico de Monitoreo
          </h2>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#A0A0A0" tick={{fill: '#A0A0A0', fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis stroke="#A0A0A0" tick={{fill: '#A0A0A0', fontSize: 12}} tickLine={false} axisLine={false} />
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="temp" stroke="#EF4444" fillOpacity={1} fill="url(#colorTemp)" strokeWidth={3} name="Temp (°C)" />
                <Area type="monotone" dataKey="hum" stroke="#3B82F6" fillOpacity={0.1} strokeWidth={3} name="Hum (%)" />
                <Area type="monotone" dataKey="ppm" stroke="#10B981" fillOpacity={0.1} strokeWidth={3} name="Gas (ppm)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Historial */}
        <div className="bg-[var(--color-surface)] border border-black/5 rounded-3xl p-8 shadow-xl max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <h2 className="text-2xl font-black text-[var(--color-primary)] flex items-center gap-2 uppercase tracking-tighter italic">Historial de Reportes</h2>
            <span className="text-sm font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-dark)] px-4 py-2 rounded-xl border border-black/5">
              Total: {filteredData.length} registros
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/5 text-[var(--color-text-muted)] text-[10px] uppercase tracking-[0.2em] font-black">
                  <th className="py-4 px-4">Fecha y Hora</th>
                  <th className="py-4 px-4">Estado</th>
                  <th className="py-4 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReports.map((report) => (
                  <tr key={report.id} className="border-b border-black/5 hover:bg-[var(--color-surface-hover)] transition-all">
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="font-black text-[var(--color-text-main)]">{format(parseISO(report.created_at), "dd/MM/yyyy")}</span>
                        <span className="text-xs text-[var(--color-text-muted)] font-bold">{format(parseISO(report.created_at), "HH:mm:ss")}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase ${
                        report.is_emergency ? 'bg-red-500/10 text-red-600' : 
                        report.alert_level === 'warning' ? 'bg-amber-500/10 text-amber-600' : 
                        'bg-emerald-500/10 text-emerald-600'
                      }`}>
                        {report.is_emergency ? 'Emergencia' : report.alert_level === 'warning' ? 'Advertencia' : 'Normal'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button 
                        onClick={() => setSelectedReport(report)}
                        className="text-[10px] font-black text-[var(--color-primary)] hover:underline uppercase tracking-widest"
                      >
                        Ver Detalles
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modals and Toasts (simplified) */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-black/5">
            <div className="bg-[var(--color-primary)] p-8 text-white">
              <h3 className="text-2xl font-black uppercase tracking-tighter italic">Reporte Detallado</h3>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[var(--color-bg-dark)] p-5 rounded-3xl border border-black/5 flex flex-col items-center">
                   <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase">Temp</span>
                   <span className="text-2xl font-black text-red-500">{selectedReport.temp.toFixed(1)}°C</span>
                </div>
                <div className="bg-[var(--color-bg-dark)] p-5 rounded-3xl border border-black/5 flex flex-col items-center">
                   <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase">Hum</span>
                   <span className="text-2xl font-black text-blue-500">{selectedReport.hum.toFixed(0)}%</span>
                </div>
              </div>
              <button onClick={() => setSelectedReport(null)} className="w-full py-4 bg-[var(--color-bg-dark)] rounded-2xl font-black uppercase tracking-widest text-xs">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {toast.visible && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 ${toast.isCritical ? 'bg-red-600' : 'bg-black'} text-white px-8 py-5 rounded-[2rem] flex items-center gap-6 z-[110] shadow-2xl`}>
          <div className="flex flex-col">
            <h4 className="font-black text-lg uppercase tracking-tighter italic">{toast.title}</h4>
            <p className="text-xs font-bold opacity-80 uppercase tracking-wide">{toast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
